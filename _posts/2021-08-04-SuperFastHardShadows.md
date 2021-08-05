---
layout: post
title: "2D Lighting with Hard Shadows"
description: "Techniques to implement simple yet efficient hard shadows for a 2D game."
date: 2021-08-04
#categories: jekyll update
permalink: SuperFastHardShadows
---

<canvas id="glcanvas" width="640" height="480"></canvas>
<script src="/js/lighting-2d/hard-shadows.js" defer></script>
[WebGL example source code](/js/lighting-2d/hard-shadows.js)

### Easy 2D Lighting with Hard Shadows

Adding dynamic lighting to your 2D game is a relatively easy way to add a lot of depth and atmosphere. In my [overview article](/2D-Lighting-Overview) I compared a number of lighting techniques for 2D games. By the end of this article, you'll have everything you need to implement fast and simple lighting with hard shadows in your game.

![hard shadow examples](/images/lighting-2d/hard-shadow-examples.png)

## Basic Screen Space Lightmaps

For 3D games, lightmaps are big texture atlasses that record how much light there is on various surfaces. Generating and using them is a _huge_ topic, but for 2D games we can do something vastly simpler. The simplest way I know of is to simply use an additive blending mode to draw some fuzzy blob sprites into an offscreen buffer using the same camera coordinates as your main scene. Then you can draw the lightmap over the top of the scene using a multiply blending mode to tint the scene by the light colors. Though it's very simplistic, it's an easy and reasonable start of a lighting system.

![lightmap a](/images/lighting-2d/lightmap-2d-a.png)
![lightmap b](/images/lighting-2d/lightmap-2d-b.png)
![lightmap c](/images/lighting-2d/lightmap-2d-c.png)

If you want more control over how the lighting is applied, you can either draw in layers or use a custom sprite shader. Using layers is easier, but not as flexible. For example, you can draw your lit background layers, multiply the lightmap over it, then draw the foreground layer over the top as unlit. Using a custom sprite shader you would use the sprite's screen coordinate to read from the lightmap and apply the tinting in the fragment shader. This lets you selectively choose which sprites are lit without relying on draw ordering or layers. It also lets you layer your lightmaps and blend between more than one of them.

This lightmap technique is very easy to implement, and even without shadows it's very satisfying. No reason why you can't just stop here and keep it simple if it fits your game well. :)

## Simple Hard Shadow Geometry

Now we get to the fun part, shadows! It might be just me, but I find shadows in 2D games to be very satisfying to watch. It's the neat effects you get as shadows spill across the floor of a room and none of the boring subtle parts that brains are good at ignoring. :) The easiest and most efficient way to add shadows that I know of is to outline all of your objects in line segments. Though it can be a tedious extra step, it's usually not too bad. If you are using a physics engine, you can probably just reuse your collision data for example. The benefit is that line segments are very efficient for casting shadows and keeps the code simple.

I've shipped a few games using this hard shadow technique. It's simple enough you don't even need shaders to make it work! (Though shaders do make it easier to explain) Here is an example running on the original iPhone:

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/EhSq8jqxTx4" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

# Shadow Masks

The basic idea is that before rendering each light, you use the shadow geometry to draw a mask that blocks the light from drawing where it's not supposed to go. The easiest way to do this in most environments is to draw the shadow mask into the lightmap's alpha channel. First clear the alpha to 1.0, draw the mask into the alpha as 0.0, and then change the light's additive blend mode to also multiply the source color by the destination alpha.

![masking example](/images/lighting-2d/masking-example.png)

Generally speaking, there isn't a "clear the alpha" function in graphics APIs. You'll have to draw a quad over the whole screen with a blend mode or write mask set so that it only affects the alpha. Alternatively, I describe a method to combine the accumulate and clear passes in the optimization section at the end.

# Shadow Projection Made Easy

In order to draw the shadow mask, you have to take those line segments that surround all of your shadow casting surfaces, and project them away from the light's origin. This turns each segment into a quad that covers the area occupied by the shadow. Two of the vertexes of this quad are just the endpoints of the line segment. To figure out where the other two go, imagine lines going from the light's center to each endpoint. The other vertexes need to be put somewhere on those lines. It doesn't really matter where as long as they are far enough away that the opposite edge of the shadow quad isn't visible onscreen.

![shadow projection](/images/lighting-2d/shadow-projection.svg)

This looks something like this in code:
```
quad_vertex[0] = endpoint[0]
quad_vertex[1] = endpoint[1]
quad_vertex[2] = endpoint[0] + 100*(endpoint[0] - light_position)
quad_vertex[3] = endpoint[1] + 100*(endpoint[1] - light_position)
```

This will project the shadows a finite distance from the line segment endpoints, in this case 100x further away. While this is easy to understand, if the shadow moves very close to the light, then the other edge of the shadow can become visible onscreen. You could just multiply by a larger number... but wouldn't it be better if you could multiply by infinity here? Well it's possible, and it's actually simpler!

# Infinite Homogenous Coordinates

One of the fundamental concepts computer graphics is built on is homogenous coordinates. Basically, they are your familiar cartesian coordinates, but they add an additional "w" coordinate. So if you have a homogenous coordinate `(x, y, z, w)` you can convert it to "normal" coordinates by dividing the _x_, _y_, and _z_ parts by _w_. This might seem weird and arbitrary, but it allows you to represent translation and perspective with matrix transforms. This subject goes surprisingly deep, but that's well out of the scope of this article. ;)

One neat property of homogenous coordinates is what happens when _w_ is zero. Say you have the coordinate `(x, y, z, w)`. If you convert that to regular coordinates you get `(x/w, y/w, z/w)`. Now normally when specifying regular coordinates, you'd use `w = 1`. If you made _w_ smaller than 1, then the converted coordinate would get bigger, but would still point in the same direction compared to the origin. The smaller you make _w_, the further away the coordinate gets. It might seem weird that _w_ could be zero since that's division by zero, but that's only when converting to regular coordinates. The math works out just fine as long as you stay in homogenous coordinates, and it represents a point at infinity in the direction of the _x_, _y_, _z_ part. This is exactly what we wanted above: a way to project the other side of the shadow off to infinity. Fortunately, since this comes up a lot in 3D graphics APIs support it, and hardware is guaranteed to understand what it means.

Rewriting the code above to use infinite projection would look something like the following.
```
quad_vertex[0] = float4(endpoint[0], 0, 1)
quad_vertex[1] = float4(endpoint[1], 0, 1)
quad_vertex[2] = float4(endpoint[0] - light_position, 0, 0)
quad_vertex[3] = float4(endpoint[1] - light_position, 0, 0)
```

3D graphics APIs support homogenous coordinates natively, although 2D graphics APIs generally do not. You can always fall back to the finite projection code above if needed.

# GPU Accelerated Shadows

The biggest CPU cost you'll run into when rendering shadows is setting up the geometry for all the shadow quads. If you have 1000 shadow segments and 10 lights, you'll need to calculate and submit 10,000 quads. While that's not a lot, you can see how quickly it can add up. Ideally what you want to do is to just copy the shadow data once to the GPU one and reuse it for all the lights.

```
// On the CPU, pack the quad data similarly to before, but as float3.
// The z-value defines if a vertex is on the near or far side of the shadow.
quad_vertex[0] = float3(endpoint[0], 0)
quad_vertex[1] = float3(endpoint[1], 0)
quad_vertex[2] = float3(endpoint[0], 1)
quad_vertex[3] = float3(endpoint[1], 1)

// In the vertex shader, use the z-value to output a homogenous coordinate.
output_position = float4(vertex.xy - vertex.z*light_position, 0, 1 - vertex.z)
```

Now to draw a light, all you need to do is to pass the `light_position` to the shader and draw the shared shadow geometry!

To further simplify the CPU's work, you could use instancing to render the shadow quads. Pass the segment endpoints as instance data, and use it to move the vertexes of a instanced quad around. Though instancing very tiny meshes like this is generally not optimal for a GPU, it tends to be way faster than the extra copying the CPU needs to do. Static geometry can always just be cached and submitted once ahead of time.

As a final thought, although platforms that don't support shaders are vanishingly rare now, it's entirely possible to do the same infinite projection with just a special perspective matrix. This is actually how I first figured out how to do the hard shadowing effect, and how I made it run well before shaders were widespread.

## Optional Optimizations

At this point you have a very simple, but effective system to draw 2D shadows! The performance isn't ideal in this simplest form however. The more lights and shadow geometry you add, the more optimization you might need.

Usually, the largest performance cost of this algorithm is the number of pixels it has to draw. You can easily end up with many, many fullscreen passes to draw a single scene:
1. Repeat for each light:
	1. Draw a fullscreen alpha clearing pass.
	1. Draw a shadow mask. (Often nearly fullscreen with a _lot_ of overdraw)
	1. Draw a light. (large lights can easily cover the whole screen)
1. Finally, draw a fullscreen pass to apply the lightmap.

Even though it's "just 2D", drawing too many pixels like this can easily tank your performance, and especially true on integrated or mobile GPUs that don't have a lot of raw memory bandwidth available.

# Not Every Light Needs Shadows

The easiest optimization is to simply skip steps 1.1 & 1.2 for lights that don't need to cast shadows. This is particularly useful for small lights as those steps end up drawing a lot of unnecessary pixels if you aren't using the scissor test optimization.

# Backface Culling

Backface culling in 3D graphics APIs allows you to skip drawing pixels for the back sides of objects. To detect which side is which, yo need to "wind" all the vertices in your triangles the same direction. (clockwise vs counterclockwise) If you wind all of your shadow geometry the same way, you can turn on backface culling and avoid drawing the shadow coming off the back of an object since it will be covered by the shadow from the front side anyway.

![backface culling](/images/lighting-2d/backface-culling.svg)

This can also be useful to draw your shadows inside out and only cast from the back edge. I've used this trick in the past (before shaders were common) in conjunction with layering to control how objects cast shadows on themselves.

# Subsampling

Another really simple optimization is to simply lower the resolution of your lightmap. In my experience, drawing shadows at half resolution is pretty subtle, but only requires drawing a quarter as many pixels. That's huge!

This is also a good use case for soft shadows that will be covered in the next article too. Although they have a slightly higher rendering cost, I often find I can get away with rendering soft shadows at a quarter resolution. That's over an order of magnitude reduction in pixels drawn!

![subsampling example](/images/lighting-2d/subsampling.png)

# Clear Alpha While Accumulating

As I mentioned earlier, it's possible to get rid of that pesky alpha clearing pass. If you have the option to use a blending mode that handles color and alpha separately, you can combine the additive pass for the light with the alpha clearing pass. The color blend mode should do the usual multiply and accumulate, while the the alpha blend mode should just overwrite the destination alpha. The trick is that you need to add padding around your light's sprite so that it will always cover the whole screen (or scissor rectangle). Texture clamping is your friend here, and make sure your light sprites are fully opaque. 

# Scissor Testing

Scissor testing allows you to limit drawing to a certain area of the screen. This is useful for small lights that only cover a small area of the screen. Set the scissor rectangle so that it only fits the light sprite. Then the alpha clearing and shadow mask passes won't draw pixels that are beyond the light's reach. This can have a _huge_ effect on performance for scenes with many small lights.

![scissor testing](/images/lighting-2d/scissor-test.svg)

# A Simple Culling Strategy

For simple scenes, you can get away without having any sort of culling, but as your levels get larger you may need to consider it at some point. The obvious place to start is to make a list of which lights are visible onscreen. A bounds check is significantly cheaper than the multiple draw calls it takes to render a single light with shadows. Also, don't go crazy with spatial indexes here. For a list of hundreds of lights that will be updated and queried once per frame it can be hard to beat the raw, cache friendly performance of a boring packed array of bounds and a linear search.

If your shadow geometry is all static, you'll almost definitely want to load it onto the GPU once and leave it there. Otherwise I would try and stick to batching all of the shadow geometry together each frame for simplicity. If you really need to cull it, try to do it coarsely. Break your static geometry into large chunks that can be copied quickly and simply. To determine which shadow casting objects are visible, take the union of the screen rect and the centers of all the visible lights. This rectangle will be a reasonable lower bound for anything that can cast shadows onto the screen.

![simple culling](/images/lighting-2d/simple-culling.svg)

In the diagram above, objects A and B are inside the expanded rect and could cast visible shadows while object C cannot. There is no way to draw a line from a light through it and end up onscreen for it to cast a shadow. This rect is obviously not a tight bound though. For instance, even though object A is onscreen it's not close enough to a light to actually cast a visible shadow. You don't need a perfect bound. A few false positives aren't that big of a problem.

## What about games that aren't quite 2D?

"2D games" is certainly a spectrum that include a lot of games that try to look like 3D games, while keeping the simplicity of 2D workflows.

# Parallax

The 2D lightmap effect can work with games with parallax scrolling. Although depending on how you want your layers to work, you might end up having to render a separate lightmap for each layer with different settings (maybe with no shadows) and matching offsets. Like any good approximation, it really requires you to stay within certain limitations.

# Isometric

It can also work really well with isometric games with same caveats. The main issue is that the lighting really only works on a single plane, and you probably want that to be the ground. Here's an example from Super Fast Soft Shadows. (our old Unity Asset) There are several tricks here to hide the 2D nature of the lighting:

* The shadow polygon is just a circle, the cross section of the tree at ground level.
* The lighting on the trunk is projected downwards and sampled only at the base of the sprite.
* The lighting on the leaves is sampled normally, but from a separate lightmap layer without any shadows applied. A sampling offset can be applied, but it usually doesn't seem necessary.
* To accommodate sprites that may sample off the bottom of the screen, the lighmap is extended past the bottom of the screen bounds.

![isometric lighting](/images/lighting-2d/isometric-lit-behind.png)

Apologies for the prototyping art. I'm almost done with the article and running out of steam to find nicer looking pictures. ;) Here's another example of objects casting nice shadows on one another.

![isometric projection](/images/lighting-2d/isometric-projection.png)

Supporting isometric games this way is a bit of a hack, but it can certainly work well if you stay within the limitations.

# Isometric #2

Isometric games are also a case where you might _want_ to use a finite projection. The finite projection code from above is an obvious choice for this. However, it's possible to modify the GPU accelerated version easily too. I'll leave that last detail up to you, dear reader.

![isometric finite shadows](/images/lighting-2d/isometric-finite.png)

([source](https://gamedev.stackexchange.com/questions/11683/real-time-shadow-casting-in-a-2d-isometric-game))

## Conclusion

That is pretty much everything I know about implementing hard shadows for 2D games. Hopefully it gives you some ideas about how you want to implement them in your own game. In the next article I'll show how to take this idea and extend it to produce fairly accurate soft shadows. Happy illuminating. :)

Thanks for reading, and stay tuned for the next post for implementing soft shadows.

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

## Easy 2D Lighting with Hard Shadows

Adding dynamic lighting to a 2D game is a relatively easy way to add a lot of depth and atmosphere to your game. In my [overview article](/2D-Lighting-Overview) I compared a number of lighting techniques for 2D games. By the end of this article, you'll have everything you need to implement fast and simple lighting with hard shadows in your game.

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

I've shipped a few games using this hard shadow technique. It's simple enough you don't even need shaders to make it work! (Though shaders make it easier to explain) Here is an example running on an old iPhone:

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/EhSq8jqxTx4" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

# Shadow Masks

The basic idea is that before rendering each light, you use the shadow geometry to draw a mask that blocks the light from drawing where it's not supposed to go. The easiest way to do this in most environments is to draw the shadow mask into the lightmap's alpha channel. First clear the alpha to 1.0, draw the mask into the alpha as 0.0, and then change the light's additive blend mode to also multiply by the destination alpha.

(TODO Needs an image to demonstrate)

Generally speaking, there isn't a "clear the alpha" function in graphics APIs. You'll have to draw a quad over the whole screen with a blend mode or write mask set so that it only affects the alpha. It's possible to avoid this clearing pass, but that's discussed later in the optimization section.

# Shadow Projection Made Easy

![shadow projection](/images/lighting-2d/shadow-projection.svg)

Something like this in code:
```
quad[0] = segment[0]
quad[1] = segment[1]
quad[2] = segment[0] + 100*(segment[0] - light_position)
quad[3] = segment[1] + 100*(segment[1] - light_position)
```

This will project the shadows a finite distance from the line segment endpoints, in this case 100x further away. While this is easy to understand, if the shadow moves very close to the light, then the other edge of the shadow can become visible onscreen. You could just multiply by a larger number... but wouldn't it be better if you could multiply by infinity here? Well it turns out you can, and it's actually simpler!

# Infinite Homogenous Coordinates

One of the fundamental concepts computer graphics is built on is homogenous coordinates. It's a very deep subject, so I'll keep this to the basics. Basically, they are your familiar cartesian coordinates, but they add an additional "w" coordinate. So if you have a homogenous coordinate `(x, y, z, w)` you can convert it to "normal" coordinates by dividing the _x_, _y_, and _z_ parts by _w_. This might seem weird and arbitrary, but it allows you to represent translation and perspective with matrix transforms.

One neat property of homogenous coordinates is what happens when _w_ is zero. Say you have the coordinate `(x, y, z, w)`. If you convert that to regular coordinates you get `(x/w, y/w, z/w)`. So normally when specifying regular coordinates, you'd use `w = 1`. If you made _w_ smaller than 1, then the converted coordinate would get bigger, but would still point in the same direction compared to the origin. The smaller you make _w_, the further away the coordinate gets. It might seem weird that _w_ could be zero since that's division by zero, but that's only when converting to regular coordinates. This math works out just fine as long as you stay in homogenous coordinates, and it represents a point at infinity in the direction of the _x_, _y_, _z_ part. This is exactly what we wanted above: a way to project the other side of the shadow off to infinity.

Rewriting tho code above to use infinite projection would look something like the following. Note that the `quad[]` vertexes are now being stored as 4 component floats.
```
quad[0] = float4(segment[0], 0, 1)
quad[1] = float4(segment[1], 0, 1)
quad[2] = float4(segment[0] - light_position, 0, 0)
quad[3] = float4(segment[1] - light_position, 0, 0)
```

This does require a graphics API that works with homogenous coordinates natively like OpenGL, or DirectX for example. Otherwise you can always fall back to the finite projection code above.

# GPU Accelerated Shadows

The biggest CPU cost you'll run into when rendering shadows is setting up the geometry for all the shadow quads. If you have 1000 shadow segments and 10 lights, you'll need to calculate and submit 10,000 quads. While that's not a lot, you can see how quickly it can add up. Ideally what you want to do is to just copy the shadow data once to the GPU one and reuse it for all the lights.

```
// On the CPU, pack the quad data similarly to before, but as float3.
// The z-value defines if a vertex is on the near or far side of the shadow.
quad[0] = float3(segment[0], 0)
quad[1] = float3(segment[1], 0)
quad[2] = float3(segment[0], 1)
quad[3] = float3(segment[1], 1)

// In the vertex shader, use the z-value to output a homogenous coordinate.
output_position = float4(vertex.xy - vertex.z*light_position, 0, 1 - vertex.z)
```

Now to draw a light, all you need to do is to pass the `light_position` to the shader and draw the shadow geometry. Given how good even the slowest GPUs are in 2021, you don't really need to put a lot of effort into culling. It's probably much faster to draw a few thousand extra polygons than it is to try and cull them.

To further simplify the CPU's work, you can use instancing to render the shadow quads. Pass the segment endpoints as instance data, and use it to move the vertexes of a instanced quad around. Though instancing very tiny meshes like this is generally not optimal for a GPU, it tends to be way faster than doing all the work on the CPU, at least for dynamic geometry anyway. Static geometry can always just be cached and submitted once ahead of time.

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

# Skip Shadows

The easiest optimization is to simply skip steps 1.1 & 1.2 for lights that don't need to cast shadows. If you don't need shadows on very small lights, that can cut down a lot on the number of pixels drawn.

# Backface culling

Backface culling in 3D graphics APIs allows you to skip drawing pixels for the back sides of objects. To detect which side is which, yo need to "wind" all the vertices in your triangles the same direction. (clockwise vs counterclockwis) You can use this almost exactly the same way for shadow geometry. If you wind all of your shadow geometry the same way, you can turn on backface culling and avoid drawing the shadow coming off the back of an object since it will be covered by the shadow from the front side anyway.

(TODO example image)

This can also be useful to draw your shadows inside out and only cast from the back edge. I've used this in the past before I could use shaders and layering to control how objects cast shadows on themselves.

# Subsampling

Another really simple optimization is to simply lower the resolution of your lightmap. In my experience, drawing shadows at half resolution is pretty subtle, but only requires drawing a quarter as many pixels. That's huge!

This is also a good use case for soft shadows too. Though they have a slightly higher rendering cost, I often find I can get away with rendering soft shadows at a quarter resolution. That's over an order of magnitude reduction in pixels drawn!

(TODO example image)

# Clear alpha while accumulating

As I mentioned earlier, it's also possible to get rid of that pesky alpha clearing pass. If you have the option to use a blending mode that handles color and alpha separately, you can combine the additive pass for the light with the alpha clearing pass. The color blend mode does the usual multiply and accumulate, while the the alpha blend mode needs to ensure the destination alpha finishes filled with 1.0. The trick is that you need to add padding around your light's sprite so that it will always cover the whole screen (or scissor rectangle). Texture clamping is your friend here.

# Scissor Testing

Scissor testing allows you to limit drawing to a certain area of the screen. This is useful for small lights that only cover a small area of the screen. Set the scissor rectangle so that it only fits the light sprite. Then the alpha clearing and shadow mask passes won't draw pixels that are beyond the light's reach. This can have a _huge_ effect on performance for scenes with many small lights.

(TODO example image)

# A Simple Culling Strategy

For simple scenes, you can get away without having any sort of culling, but as your levels get larger you may need to consider it at some point. The obvious place to start is to make a list of which lights are visible onscreen. A bounds check is significantly cheaper than the multiple draw calls it takes to render a single light + shadows. Also, don't go crazy with spatial indexes here. For a list of hundreds of lights that will be updated and queried once per frame... it can be hard to beat the cache friendly raw performance of a boring old packed array of bounds + linear search.

If your shadow geometry is all static, you'll almost definitely want to load it onto the GPU once and leave it there. Otherwise I would try and stick to batching all of the shadow geometry together each frame for simplicity. If you really need to cull it, try to do it coarsely. Break your static geometry into large chunks that can be copied quickly and simply. To determine which shadow casting objects are visible, take the union of the screen rect and the centers of all the visible lights. This rectangle will be a reasonable lower bound for anything that can cast shadows onto the screen. The basic idea is that only objects that come between a visible light and the screen's rect can cast a shadow that is visible.

(TODO example image)

## Conclusion

That is pretty much everything I know about implementing hard shadows for 2D games. Hopefully it gives you some ideas about how you want to implement them in your own game. In the next article I'll show how to take this idea and extend it to produce fairly accurate soft shadows. Happy illuminating. :)

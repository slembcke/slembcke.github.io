---
layout: post
title: "2D Lighting with Soft Shadows"
description: "Extending the hard shadow technique with accurate penumbras."
date: 2021-08-09
#categories: jekyll update
permalink: SuperFastSoftShadows
---

<canvas id="glcanvas" width="640" height="480"></canvas>
<script src="/js/lighting-2d/soft-shadows.js" defer></script>
[WebGL example source code](/js/lighting-2d/soft-shadows.js)

This article is an extension of the article about [hard shadows](/SuperFastHardShadows). If you haven't read that one yet, you definitely will want to do that first! The math in this article gets considerably more involved, and you'll want to have a good foundation.

## Super Fast Soft Shadows

Soft shadows just make everything look better! I think this is true even in pixel art games where the aliased, crunchy look of hard shadows _should_ fit in better. Because of the potential, I spent years, pondering about a better way to draw them. Basically I wasn't willing to give up my nice hardware accelerated solution that had such a minimal CPU impact for a little blur. I was aware of a few variations of "[shadow fins](http://archive.gamedev.net/archive/reference/articles/article2032.html)", but they all seemed to involve a lot of CPU work, and some of them had some nasty motion artifacts where the penumbras would suddenly jump as an object or light moved.

![soft shadow example](/images/lighting-2d/soft-shadows-asteroids.png)

Around 2015, I finally had a breakthrough while working on the Cocos2D-SpriteBuilder project. (a mobile oriented, open source game framework) The first version of Super Fast Soft Shadows (SFSS) was born! Unfortunately, the company sponsoring my open source contributions folded and was dissolved. We had to scramble to find some new projects to pay the bills, and so I ported the code over to Unity3D and tried to sell it on the Asset Store. It was a very mild success, but the algorithm didn't change until I revived and rejuvenated it for [Project Drift](/ProjectDrift)

This article has been rattling around my brain for years. I pitched and had it rejected as a GDC presentation twice. Though since the topic of 2D lighting is a pretty niche I wasn't too surprised. Instead I've been meaning to write it up properly as a blog post as soon as I "get around to it". Today I did! :D

## Penumbras and umbras and-tumbras, Oh My!

Lets dive right in by looking at a diagram of a light casting a penumbra around the corner of a wall:

![penumbra diagram](/images/lighting-2d/penumbra-diagram-half.svg)

You can find the bounds of the penumbra by drawing lines through the corner of the shadow and tangent to the light's surface. Now imagine you are an observer standing in that diagram. If you were standing in the "no shadow" region, you would be able to see the whole light source with the wall casting the shadow to its left. If you walked down below the top red line, then you would see the wall covering part of the light source. You are now in the penumbra, and the percentage of the light's area covered is the strength of the shadow at your location. If you walked to the left of the other red line, then the light would be completely covered. You are now in the umbra, and it's black because no light can reach you. The little icons in the image should help you visualize this.

Again, imagine standing in the penumbra and walk along one of the dashed lines. Although the wall and light would get farther away, the percentage of the light covered by the wall wouldn't change. Any line you pick in the penumbra that goes through the wall's corner will have this property. Now lets reduce the size of the wall so that it's smaller than the light itself:

![penumbra diagram](/images/lighting-2d/penumbra-diagram-full.svg)

When I first saw this diagram, I thought I would surely have to generate a mesh based on the geometry of the red lines. The penumbra seems like just a simple gradient, but how could the umbra and antumbra be handled without special cases? Fortunately I was completely wrong! After thinking about the problem over a few years, I finally realized the existence of those dashed lines means it's all just linear math. This is extremely good news as GPUs have all sorts of silicon dedicated to handling linear math burned right into their very essence!

Let's go back to our thought experiment again. Imagine yourself walking along the dashed line in the second diagram. You'll start out by observing the same thing as before. The wall covers the same percentage of the light as you get farther away. Once you cross the red line and pass into the antumbra, the opposite edge of the light will start to peek out from behind the other side of the wall. Since you aren't moving on a line that passes through the second corner, more of the light on that side will become visible as you continue walking. The amount of light reaching you in the antumbra is the percentage of the light visible on the right side plus the light visible on the left side of the wall.

So all you need to do to draw an accurate shadow, including the penumbras, umbra, and antumbra is to add some gradients together! This means that, like with hard shadows, you can draw a segment's shadow with a single quad, and use a shader to do all of the work on the GPU. Just like with hard shadows, all the CPU has to do is batch the geometry once and copy it to the GPU. No further processing or per-light calculations are required.

As a final thought experiment, let's think about how we can handle shadows from adjacent line segments. Imagine you are standing in the penumbra again. The wall covers half of the light, but this time the other half shines through a doorway. If you close the door, it will cover the other half of the light. It's pretty easy to see how wherever you stand in the penumbra, whatever fraction of the light that isn't covered by the wall will be covered by the door. This gives us an easy way to just add the shadow masks from adjacent line segments together to combine them. Though when applying the idea to shadow masks, we'll actually be subtracting them from 1.0 instead.

## Soft Shadow Geometry

In order to push as much of the processing to the GPU as possible, we do have to make a couple of concessions. In order for the vertex shader to be able to calculate the gradients for the penumbras, every vertex needs to know where both endpoints of the segment are. Additionally, because the penumbras will cause the shadows to overlap instead of sharing the same edges, you can't batch them into triangle strips anymore. This means that non-indexed geometry becomes a straight up awful solution requiring a lot of redundant data, indexed geometry is better, and instancing is also a good choice.

Each vertex will need a copy of the full segment's geometry (both endpoints), and also a 2D "shadow coordinate". The y-value of the shadow coordinate is similar to the one used in hard shadows, corresponding to the near and far edge of the shadow. The x-value defines whether the vertex is associated with the first or second endpoint. In pseudo-code:

```
quad_vertexes = {
	{vec4(endpoint_a, endpoint_b), vec2(0, 0)},
	{vec4(endpoint_a, endpoint_b), vec2(1, 0)},
	{vec4(endpoint_a, endpoint_b), vec2(0, 1)},
	{vec4(endpoint_a, endpoint_b), vec2(1, 1)},
}
```

# Expanding the Shadow Geometry for the Penumbra

If we are going to draw the entire shadow with a single quad, the first thing we need to do is make the quad cover the penumbra. We can, and will use the infinite projection math from the previous article again. The only difference is that we need to use the delta between the endpoint and a tangent point instead of the light's center.

![penumbra geometry](/images/lighting-2d/penumbra-geometry.svg)

I can already hear some of you screaming, and yes, I know it's not quite correct. I originally used the correct tangent point, but this approximation has a few advantages I'll discuss later. Right now, it's enough to say that it's simpler to explain. All you need to do is normalize the delta, rotate it 90 degrees in the right direction for the current endpoint, and multiply by the light's radius. As GLSL code in the vertex shader it looks something like this:

```
attribute vec4 a_segment;
attribute vec2 a_shadow_coord;

uniform mat4 u_matrix;
uniform vec3 u_light;

...

// Unpack the vertex shader input.
vec2 endpoint_a = a_segment.zw;
vec2 endpoint_b = a_segment.xy;
vec2 endpoint = mix(endpoint_a, endpoint_b, a_shadow_coord.x);
float light_radius = u_light.z;

// Deltas from the segment to the light center.
vec2 delta_a = endpoint_a - u_light.xy;
vec2 delta_b = endpoint_b - u_light.xy;
vec2 delta = endpoint - u_light.xy;

// Offsets from the light center to the edge of the light volume.
vec2 offset_a = vec2(-light_radius,  light_radius)*normalize(delta_a).yx;
vec2 offset_b = vec2( light_radius, -light_radius)*normalize(delta_b).yx;
vec2 offset = mix(offset_a, offset_b, a_shadow_coord.x);

// Vertex projection.
float w = a_shadow_coord.y;
vec3 proj_pos = vec4(mix(delta - offset, endpoint, w), 0.0, w);
```

Note that we need to calculate _both_ sides of the segment's properties even though a given vertex is only associated with one side of the segment or the other based on the value of `a_shadow_coord.x`. The reason for all these redundant calculations will become clear later. To clarify the convention I'm using, `endpoint_a` and `endpoint_b` are the first and second endpoints of the line segment while `endpoint` is the current vertex's endpoint as selected by `a_shadow_coord.x`. Several sets of variables follow this pattern.

## Shading

# Penumbra Gradients

Now that we can cover the full area of the shadow, we need to start figuring out how to draw the gradients for the penumbras. If your first thought was that you can use `atan()` to create a radial gradient then you aren't wrong, but there's a better way! Remember those dashed lines? They mean it's a linear system, and we can use matrices to simplify the math and keep expensive inverse trig functions out of the fragment shader. In fact, if there were any platforms left in 2021 that only supported vertex shaders, you could do this oldschool with projective texutring and combiners. Are you still making Nintendo 3DS games? This could be your swan song! :)

So how do we draw a simpler gradient that is still correct? Let's start by looking at a plot of  `smoothstep(-1.0, 1.0, uv.x/uv.y)`:

![gradient x/y](/images/lighting-2d/gradient-x-y.svg)

This already has some nice properties! It comes to a point in the middle. It has a nice falloff so you don't see the discontinuities in the derivative. It's implicitly clamped to the range [0, 1]. It's even "close enough" to the integral of `cos(pi*x)` to give us a nice approximation of the solid angle of a spherical light source. Lastly, it's cheap! The only problem with it is the inverted copy of the gradient when the y-value is negative, but can easily be blacked out using `step()`. Now the only issue is how to transform the pixel coordinates into the gradient's coordinates. Hmm... Transforming coordinates of a linear system? Matrices!

![penumbra gradient matrix](/images/lighting-2d/penumbra-gradient-matrix.svg)

We can construct a coordinate basis using `-offset` as the the x-axis, and `delta` as the y-axis. Then to convert from endpoint relative coordinates to penumbra gradient coordinates, all we need to do use the basis vectors as the columns of a matrix, and invert it. If we calculate the gradient coordinates of all for corners of the shadow quad, we can let the GPU interpolate them, and then all the fragment shader would need to do is calculate the gradient above!

"But wait!" you say, "Aren't 2 of the 4 those vertexes off at infinity? How can the GPU interpolate them!?" Well, there's good news and good news. The GPU will interpolate them, and it's even well defined due to how homogenous coordinates work. Also, since `x/y` is just a ratio, we can simplify things even further. We don't actually care what the gradient coordinates at the infinite points are as long as the ratio is correct. Lastly, if we calculate the matrix inverse as `adjugate(m)/determinant(m)`, then we can even skip the division by the determinant. In the vertex shader it looks something like this:

```
// Keep in mind GLSL is column major. You'll need to swap row/column for HLSL.
mat2 adjugate(mat2 m){return mat2(m[1][1], -m[0][1], -m[1][0], m[0][0]);}

...

vec2 penumbra_a = adjugate(mat2( offset_a, -delta_a))*(delta - mix(offset, delta_a, w));
vec2 penumbra_b = adjugate(mat2(-offset_b,  delta_b))*(delta - mix(offset, delta_b, w));
```

The extra negation inside the `mat2()` constructors is necessary to preserve the sign change dividing by the determinant would have caused. To explain the significance of `delta - mix(offset, delta_a, w)`, consider it's value in the following diagram for various values of `a_shadow_coord`.

![penumbra gradient coords](/images/lighting-2d/penumbra-gradient-coords.svg)

These vectors all line up the the direction along the gradient that we need to interpolate for the fragment shader. Now all we have to do is pass them to the fragment shader and combine them.

```
varying vec4 v_penumbras;

...

// In the vertex shader, pass the gradient coordinates.
// Handle the special case where 'light_radius' is zero.
v_penumbras = (light_radius > 0.0 ? vec4(penumbra_a, penumbra_b) : vec4(0, 1, 0, 1));

...

// In the fragment shader, we just need to divide, smoothstep...
mediump vec2 penumbras = smoothstep(-1.0, 1.0, v_penumbras.xz/v_penumbras.yw);
// .. add them, and mask out the flipped gradient where y < 0.
mediump float penumbra = dot(penumbras, step(v_penumbras.yw, vec2(0.0)));

```

## Issues

# Precision

The idea that adjacent shadows can simply be blended together without any seams is sort of a lie. In reality, It's basically impossible to avoid numerical precision issues when drawing disjoint geometry like this. The result is that you might see speckled cracks in the shadows of bright lights because they don't quite add up to 100% where they overlap. Fortunately the solution is simple, just fudge the math to darken the shadows a little.

```
penumbra -= 1.0/64.0; // Numerical precision fudge factor.
```

# Subtracting Shadows is Wrong

One of the primary ideas this is built in is that you can simply subtract one shadow from another to combine them. This actually only works for shadows that are adjacent though. If you have two separate objects that both cover the left half of a light at different distances, it's incorrect to subtract them and get 100% shadow since the right half of the light isn't covered. There isn't an easy solution to calculate which part of the light is covered and store it as far as I know. Fortunately, this is very subtle, and I doubt that many people will ever notice this.

# Clipping Reversed Shadows

When a light source gets split by a line segment's plane, the _correct_ thing to do would be to cast a shadow from both sides, but I could never figure out a reasonable way to handle this. Instead, I just clip the shadows to prevent them from projecting forwards. The approximate tangent calculation used earlier also helps slightly by avoiding some of the cases where this happens.

![penumbra clipping](/images/lighting-2d/penumbra-clipping.svg)

In the vertex shader, I calculate the normal of the segment and use it to calculate an "edge" coordinate that I clip by in the fragment shader.

```
// Clipping only uses the z-coordinate.
// x/y will be used in the section on light penetration.
varying vec3 v_edges;

...

// In the vertex shader, calculate a normal vector
vec2 seg_delta = endpoint_b - endpoint_a;
vec2 seg_normal = seg_delta.yx*vec2(-1.0, 1.0);
// Calculate a clipping coordinate that is 0 at the near edge (when w = 1)...
// otherwise calculate the dot product with the projected coordinate.
v_edges.z = dot(seg_normal, delta - offset)*(1.0 - w);

...

// In the fragment shader, use this edge to mask the output pixels. 
gl_FragColor = vec4((1.0 - penumbra)*step(v_edges.z, 0.0));
```

This does create some artifacts since part of the shadow that should be cast in front of the segment is missing. Fortunately, they are usually pretty subtle and only visible at specific angles. It seems like a solvable problem, but not one that is worth the effort or complexity in my opinion.

![clipping artifact](/images/lighting-2d/penumbra-clipping-artifacts.png)

# HDR Lightmaps

Here's yet another case where simply subtracting the shadows breaks down. If you aren't using an HDR lightmap, subtracting shadows from the mask is fine since with fixed precision formats your colors must be in the range [0, 1]. When you subtract a shadow from the mask where it's already zero, you still get zero.

This isn't the case with floating point HDR lightmaps though. Since their dynamic range isn't really limited, when multiple shadows overlap the same pixels your lightmap will end up with negative numbers in it. Then when you multiply the light cookie against the mask, you'll get negative light values. Whoops!

For a long time, the best solution I had was to run an alpha clamping pass using a "max" blend mode in conjunction with a solid black pass. This would clamp the negative pixels in the shadow mask back to zero. This worked fine, but requiring an extra draw call and rendering pass is not ideal. One solution to avoid this is using programable blending, but that's only supported on a few mobile GPUs.

I eventually came up with a better, but fairly bizarre solution. It really needs it's own article to explain it properly... Basically it involves rendering the lights without shadows first into their own buffer. I do this at 1/8th the screen resolution in a single batch so it's practically free. Then you draw a second map that just contains how much light should have been blocked by shadows using the "alpha saturate" source color blend factor to clamp the negative mask values. Finally, when this second map is subtracted from the lightmap, you get correctly shadowed results!

## Light Penetration

A final optional effect I would highly recommend is to allow the light to penetrate slightly into surfaces. This has a few benefits. The first is that it allows you to light up the edges of objects, letting the player see a bit of detail on them. The second is that the near edge of the shadow is still and aliased, and this is a cheap way to soften it. Beyond just the aesthetics, this makes it viable to reduce the resolution of your lightmap without sacrificing any noticeable details _and_ vastly decreasing the performance cost. This can make soft shadows not only look better, but run faster at the same time! :D It's a win/win scenario.

![light penetration](/images/lighting-2d/shadow-soft.png)

Unfortunately... I don't exactly remember how some of this code works without re-deriving it. :( It has sort of been optimized into oblivion to push as much of the work into the vertex shader as possible. I might come back later to rewrite this section, but for now I'm just going to present it as is.

```
varying vec3 v_pro_pos;
varying vec4 v_endpoints;

...

// Finally fill in the remaining "edge" values.
// These are used to calculate the closest point on the segment to the pixel.
// I don't remember why this part works.
v_edges.xy = inverse(mat2(seg_delta, delta_a + delta_b))*(delta - offset*(1.0 - w));
v_edges.y *= 2.0;

float light_penetration = 0.01;
// Scale the vertex position by the light penetration amount.
// This saves a bit of effort in the fragment shader.
v_proj_pos = vec3(proj_pos.xy, w*light_penetration);
// Lastly, pass the segment endpoints along to the fragment shader.
v_endpoints = vec4(endpoint_a, endpoint_b)/light_penetration;

...

// Now in the fragment shader, calculate the closest point.
mediump float closest_t = clamp(v_edges.x/abs(v_edges.y), -0.5, 0.5) + 0.5;
mediump vec2 closest_p = mix(v_endpoints.xy, v_endpoints.zw, closest_t);
// Compare this to fragment position to measure how far the light penetrated.
mediump vec2 penetration = closest_p - v_proj_pos.xy/v_proj_pos.z;
// Attenuate the light based on this distance.
// Squared distance is a good and easy choice. :)
mediump float bleed = min(dot(penetration, penetration), 1.0);

// Finally, multiply the light bleeding factor into the shadow mask.
gl_FragColor = vec4(bleed*(1.0 - penumbra)*step(v_edges.z, 0.0));
```

## Limitations

This soft shadowing algorithm inherits pretty much all of the limitations of the hard shadows described in the previous article, though it doesn't really add any new ones. The only caveat is that since lights now have area, the overlap problem is exacerbated. This is manageable with the tangent approximation used earlier.

## Closing Thoughts

Hopefully people find this useful for their own projects as it took a _long_ time to figure out the math and work out all the bugs. This might not be a perfect technique for rendering soft shadows, but it will always find a place in my games. :)

In the next article, I'll document my method for compactly storing 2D lightfields to use with normal mapping as a replacement for lightmaps.

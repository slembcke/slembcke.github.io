---
layout: post
title: "2D Lighting with Soft Shadows"
description: "Extending the hard shadow technique with accurate penumbras."
date: 2021-08-04 12:00:00 -0500
#categories: jekyll update
permalink: SuperFastSoftShadows
---

<canvas id="glcanvas" width="640" height="480"></canvas>
<script src="/js/lighting-2d/soft-shadows.js" defer></script>
[WebGL example source code](/js/lighting-2d/soft-shadows.js)

This article is an extension of the article about [hard shadows](/SuperFastHardShadows). If you haven't read that one yet, you definitely will want to do that first! The math in this article gets considerably more involved, and you'll want to have a good foundation.

## Super Fast Soft Shadows

Soft shadows just make everything look better. I think this is true even in pixel art games where the aliased, crunchy look of hard shadows _should_ fit in better. I spent a long time, years, pondering about a good solution to draw soft shadows. Basically I wasn't willing to give up my nice hardware accelerated solution that had such a minimal CPU impact. I was aware of a few variations of "[shadow fins](http://archive.gamedev.net/archive/reference/articles/article2032.html)", but they all seemed to involve a lot of CPU work, and some of them had some nasty motion artifacts where the penumbras would suddenly jump as an object and light moved.

![soft shadow example](/images/lighting-2d/soft-shadows-asteroids.png)

Around 2015, I finally had a breakthrough while working on the Cocos2D-SpriteBuilder project. (a mobile oriented, open source game framework) The first version of Super Fast Soft Shadows was born! Unfortunately, the company sponsoring my open source contributions folded and was dissolved. We had to scramble to find some new projects to pay the bills, and so I ported the code over to Unity3D and tried to sell it on the Asset Store. It did okay at best, but my serious advice would be to avoid the Asset Store. That's probably a story for another post, but the short version is that Unity is a really unstable platform to target. As a middleware developer you are responsible for every breaking change, bug, and new half supported renderer that Unity releases.

This article has been rattling around my brain for years. I pitched, and had it rejected twice as a GDC presentation. Since the topic of 2D lighting is a pretty niche I wasn't too surprised, but I've always meant to write it up properly as a blog post as soon as I "get around to it". Today I did! :D

## Penumbras and umbras and-tumbras, Oh My!

Lets dive right in by looking at a diagram of a light casting a penumbra around the corner of a wall:

![penumbra diagram](/images/lighting-2d/penumbra-diagram-half.svg)

You can find the bounds of the penumbra by drawing lines through the corner of the shadow to the tangent points on the light's bounds. Now imagine you are an observer standing in that diagram. If you were standing in the "no shadow" region, you would see the whole light source, and the wall casting the shadow would be to it's left. If you walked down below the top red line, then you would see the wall covering part of the light source. You are now in the penumbra, and the percentage covered is the strength of the shadow at your location. If you walked to the left of the other red line, then the light would be completely covered. You are now in the umbra, and it's black because no light can reach you. The little icons in the image should help you visualize this.

Thought experiment time again! Imagine standing in the penumbra and walk along one of the dashed lines. Although the wall and light would get farther away, the percentage of the light covered by the wall wouldn't change. Any line you pick in the penumbra that goes through the wall's corner will have this property in fact. Now compare this to the a full diagram where the light is larger than the wall casting the shadow:

![penumbra diagram](/images/lighting-2d/penumbra-diagram-full.svg)

When I first saw this diagram, I thought surely I would have to generate a mesh based on the geometry of the red lines. The penumbra seems like just a simple gradient, but how would I handle the umbra and antumbra without adding special cases? Fortunately I was completely wrong! After thinking about the problem over a few years, I finally realized the existence of those dashed lines means it's all just linear. This is extremely good news as GPUs have all sorts of silicon dedicated to handling linear math burned right into their very essence!

Let's go back to our thought experiment again. Imagine yourself walking along the dashed line in the second diagram. You'll start out by observing the same thing as before. The wall covers the same percentage of the light as you get farther away. Once you cross the red line and pass into the antumbra, the edge of the light will start to peek out from behind the other side of the wall. Since you aren't moving on a line that passes through the second corner, more of the light on that side will become visible. The amount of light reaching you is the percentage of the light visible on the right side plus the light visible on the left side.

So all you need to do to draw an accurate shadow, including the penumbras, umbra, and antumbra is to add some gradients together! This means that, like with hard shadows, you can draw a segment's shadow with just a quad, and use a shader to do all of the work on the GPU. Just like with hard shadows, all the CPU has to do is batch the geometry once and copy it to the GPU. No further processing or per-light calculations required.

As a final thought experiment, let's think about how we can handle shadows from adjacent line segments. Imagine you are standing in the penumbra a doorway. The wall covers half of the light, but the other half shines through the doorway. If you close the door, it will cover the other half of the light. It's pretty easy to see how wherever you stand in the penumbra, whatever fraction of the light isn't covered by the wall will be covered by the door. This gives us an easy way to just add the shadow masks from adjacent line segments together. Though when applying the idea to shadow masks, we'll actually be subtracting them from 1.0 instead.

## Soft Shadow Geometry

In order to push as much of the processing to the GPU as possible, we do have to make a couple of concessions. In order for the vertex shader to be able to calculate the gradients for the penumbras, every vertex needs to know where both endpoints of the segment are. Additionally, because the penumbras will cause the shadows to overlap instead of sharing the same edges, you can't batch them into triangle strips anymore. This means that non-indexed geometry becomes a straight up awful solution requiring a lot of redundant data, indexed geometry is better, and instancing seems like a good idea. I use instancing in my game and don't care if there is a small mesh performance penalty since the shadow geometry processing is not at all a bottleneck.

Each vertex will need a copy of the full segment's geometry (both endpoints), and also a 2D "shadow coordinate". The y-value of the shadow coordinate is similar to the one used in hard shadows, corresponding to the near and far edge of the shadow. The x-value defines whether the vertex is associated with the first or second endpoint. Written in pseudo-code:

```
quad_vertexes = {
	{vec4(endpoint_a, endpoint_b), vec2(0, 0)},
	{vec4(endpoint_a, endpoint_b), vec2(1, 0)},
	{vec4(endpoint_a, endpoint_b), vec2(0, 1)},
	{vec4(endpoint_a, endpoint_b), vec2(1, 1)},
}
```

This is a lot of duplicate data to push around, especially if you are going to do dynamic batching. It's why I use instancing instead of indexed geometry to cut down on the redundancy, but the simple nature of the vertex geometry makes it cheap to just copy around at least.

# Expanding the Shadow Geometry for the Penumbra

If we are going to draw the entire shadow with a single quad, the first thing we need to do is make the quad cover the penumbra. We can, and will use the infinite projection math from the previous article again. The only difference is that we need to use the delta between the endpoint and the tangent point instead of the light's center.

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

Note that we need to calculate _both_ sides of the segment's properties even though a given vertex is only associated with one side of the segment or the other based on the value of `a_shadow_coord.x`. Just to clarify some terminology here that I'll continue using. For example, `endpoint_a` and `endpoint_b` are the first and second endpoints of the line segment while `endpoint` is the current vertex's endpoint as selected by `a_shadow_coord.x`. The reason for all these redundant calculations will become clear later.

## Shading

# Penumbra Gradients

Now that we can cover the full area of the shadow, we need to start figuring out how to draw the gradients for the penumbras. If your first thought was that you can use `atan()` to create a radial gradient then you aren't wrong, but there's a better way! Remember those dashed lines? They mean it's a linear system, and we can use matrices to simplify the math and keep expensive inverse trig functions out of the fragment shader. In fact, if there were any platforms left in 2021 that only supported vertex shaders, you could do this old school with projective texutring and combiners. If you are still making Nintendo 3DS games, this could be your swan song. :)

So how do we draw a simpler gradient that is still correct? Let's start by looking at a plot of  `smoothstep(-1.0, 1.0, uv.x/uv.y)`:

![gradient x/y](/images/lighting-2d/gradient-x-y.svg)

This already has some nice properties! It comes to a point in the middle. It has a nice falloff so you don't see the discontinuities in the derivative. It's implicitly clamped to the range [0, 1]. It's even "close enough" to the integral of `cos(pi*x)` to give us a nice approximation of the solid angle of a spherical light source. Lastly, it's cheap! The only problem with it is the inverted copy of the gradient when the y-value is negative. We can just black that out using `step()` easily enough though. Now the only issue is how we can transform the pixel coordinates into the gradient's coordinates. Hmm... Transforming coordinates of a linear system? Matrices!

![penumbra gradient matrix](/images/lighting-2d/penumbra-gradient-matrix.svg)

We can construct a coordinate basis using `-offset` as the the x-axis, and `delta` as the y-axis. So to convert from endpoint relative coordinates to penumbra gradient coordinates, all we need to do use the x and y basis vectors as the columns of a matrix, and invert it. If we calculate the gradient coordinates of all for corners of the shadow quad, we can let the GPU interpolate them, and then all the fragment shader would need to do is calculate `x/y`!

"But wait!" you say, "Aren't 2 of the 4 those vertexes off at infinity? How can the GPU interpolate them!?" Well, there's good news and good news. The GPU will interpolate them, and it's even well defined due to how homogenous coordinates work. Also, since `x/y` is just a ratio, we can simplify things even further. We don't actually care what the gradient coordinates at the infinite points are as long as the ratio is correct. Lastly, if we calculate the matrix inverse as `adjugate(m)/determinant(m)`, then we can even skip the division by the determinant. (well... sort of) In the vertex shader it looks something like this:

```
// Keep in mind this is GLSL code. You'll need to swap row/column for HLSL.
mat2 adjugate(mat2 m){return mat2(m[1][1], -m[0][1], -m[1][0], m[0][0]);}

...

vec2 penumbra_a = adjugate(mat2( offset_a, -delta_a))*(delta - mix(offset, delta_a, w));
vec2 penumbra_b = adjugate(mat2(-offset_b,  delta_b))*(delta - mix(offset, delta_b, w));
```

You can see what I mean by "well... sort of". The extra negation inside the `mat2()` constructors is necessary to preserve the sign of the determinant. Otherwise consider the value of `delta - mix(offset, delta_a, w)` in the following diagram for various values of `a_shadow_coord` before it gets transformed into gradient coordinates for `penumbra_a`.

![penumbra gradient coords](/images/lighting-2d/penumbra-gradient-coords.svg)

These vectors all line up the the direction along the gradient that we need to interpolate for the fragment shader. The last details for rendering penumbras is passing them to the fragment shader and applying them.

```
varying vec4 v_penumbras;

...

// Handle the special case where 'light_radius' is zero.
v_penumbras = (light_radius > 0.0 ? vec4(penumbra_a, penumbra_b) : vec4(0, 1, 0, 1));

...

// In the fragment shader, we just need to divide, smoothstep...
mediump vec2 penumbras = smoothstep(-1.0, 1.0, v_penumbras.xz/v_penumbras.yw);
// .. add them, and mask out the inverted gradient where y < 0.
mediump float penumbra = dot(penumbras, step(v_penumbras.yw, vec2(0.0)));

```

# Clipping Reversed Shadows

At this point, there is only one remaining issue to solve before the shadows are usable. When a light source gets split by a line segment's plane, the _correct_ thing to do would be to cast a shadow from both sides, but I could never figure out a reasonable way to handle this. Instead, I just clip the shadows to prevent them from projecting forwards. The approximate tangent calculation used above also helps slightly by avoiding some of the cases where this happens.

![penumbra clipping](/images/lighting-2d/penumbra-clipping.svg)

In the vertex shader, I calculate the normal of the segment and use it to calculate an "edge" coordinate that I clip by in the fragment shader.

```
// Clipping only uses the z-coordinate.
// x/y will be used in the next optional section.
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

This does create some artifacts since part of the shadow that should be cast in front of the segment is missing, but they are usually pretty subtle and only visible at specific angles. It seems like a solvable problem, but not one that is worth the effort in my opinion.

![clipping artifact](/images/lighting-2d/penumbra-clipping-artifacts.png)

## Light Penetration

(TODO)

## Issues

# Precision

# HDR Lightmaps

## Limitations

Subtracting Shadows is Wrong

Clipping reversed shadows is wrong

lights overlapping geometry

## Closing Thoughts

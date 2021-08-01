---
layout: post
title:  "2D Lighting Techniques"
description: "An overview of various 2D lighting techniques."
date:   2021-08-01
permalink: 2D-Lighting-Overview
---

<!--
Stockpile of Links I can start adding to other implementations:
https://forum.yoyogames.com/index.php?threads%2Fultra-fast-2d-dynamic-lighting-system.80742%2F
https://forum.yoyogames.com/index.php?threads%2Fquick-ray-traced-qrt-lighting-tutorial.60842%2F
https://medium.com/@NoelFB/remaking-celestes-lighting-3478d6f10bf
https://www.redblobgames.com/articles/visibility/
https://ncase.me/sight-and-light/
http://www.catalinzima.com/2010/07/my-technique-for-the-shader-based-dynamic-2d-shadows/
-->

In the early 2000's I played a lovely indie game called [Gish](http://www.chroniclogic.com/gish.htm). One of the many great things about the game was its 2D light and shadow effects. They were glorious, and I had never seen anything quite like them in a 2D game before.

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/sFlzTyjR4M8?start=12" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

I decided right away I had to reverse engineer how it was done, and over the years have come up with some nice extensions to it. Before getting into the details of my own algorithm, I figured it would be good to have an overview of other techniques I've seen and try to discuss some of their strengths and weaknesses.

## Builtin!

![logos](/images/lighting-2d/logos.png)

A quick search makes it look like Godot, Game Maker, Construct, and Unity all have builtin components for 2D lighting now. If it works well for you then you are good to go! This is why people use engines after all.

**Pros:**
* You already have it.
* It's probably good enough.

**Cons:**
* Is it missing a feature you want? (normals, soft shadows, performance, etc)

## Traditional 3D Lighting Algorithms

3D lighting algorithms tend to work fine in 2D with many of the same caveats. Since they are common in existing engines, they can be very practical. On the other hand, one of the main issues with using 3D software for rendering lit 2D scenes is that you may have to get creative about how you are casting shadows. Since these algorithms are common and well documented, I won't go into a lot of details.

# Forward Rendering

Forward rendering is one of the most quintessential algorithms for 3D. While there are a number of variations, the basic idea is to first render a surface using just the ambient light (or maybe vertex lighting), then loop over all the lights that shine on the object and render it again using additive blending as if lit individually by each light. In the worst case, you can end up with `(number of lights) * (number of objects)` draw calls and a similar metric for the number of shaded fragments. This means that it doesn't scale well, but it does have a very low base cost. Most game engines use forward rendering by default making it very convenient to use, and you can find many examples of 2D games lit using forward rendering.

**Pros:**
* Very flexible when you want to have many materials.
* Works with alpha blended, or transparent objects too.
* Easy to implement the basics.

**Cons:**
* Difficult to scale efficiently to many lights.
* Each light needs it's own shadow buffer to cast shadows.
* Common optimizations often don't apply to 2D. (depth prepass, sorting draw calls, etc)

# Deferred Rendering

![gbuffer example](/images/lighting-2d/gbuffer.png)

(CC BY-SA 4.0 via Wikipedia - [Deferred Rendering](https://en.wikipedia.org/wiki/Deferred_shading))

Deferred Rendering is a solution to the number of rendering passes required by forward rendering. Instead of rendering each object in multiple passes, you render a screen space "gbuffer" of surface properties such as the color, normal, and depth. Then you draw each light by reading back the surface properties and calculating the amount of light reflected back to the viewer. This reduces the rendering cost to `(number of lights) + (number of objects)` draw calls. [Cryptark](http://www.cryptark.com/) is a good example of a game using deferred lighting in 2D and it looks glorious. :D

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/_O8B4-X-NBw" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

**Pros:**
* Scales easily to having many lights.
* Cheaper to add shadows.

**Cons:**
* Difficult to implement multiple materials.
* Does not work with transparency or alpha blending. (hard edged sprites)
* Base cost is much higher than forward rendering.

## Screen Space Lightmaps

A very common and simple technique for 2D games is to generate a screen space lightmap each frame. Basically you just need somewhere to render offscreen. Draw a bunch of blurry blobs as sprites, then multiply the lightmap over the top of the framebuffer. Dark areas become dark, and lit areas get tinted by the light. This is surprisingly versatile, and is the basis for many other algorithms and implementations.

![lightmap example](/images/lighting-2d/lightmap-2d-a.png)
![lightmap example](/images/lighting-2d/lightmap-2d-b.png)
![lightmap example](/images/lighting-2d/lightmap-2d-c.png)

**Pros:**
* Very easy to implement using offscreen rendering and a couple blend modes.
* Doesn't complicate 2D rendering.
* Easy to extend with shadows.
* Extremely fast.

**Cons:**
* "Lighting" is somewhat generous. You just get `color * light`.
* Doesn't work with normal mapping.
* Strictly a 2D effect, and may not work well in a "2.5D" game.

## Hard Shadow Geometry

If you want shadows in your lightmap, then you'll need to only add light where the light can actually reach. There are a number of ways to do this, but one way that greatly simplifies the rendering is if you have tight fitting polylines that outline everything in your game that you want to cast shadows. Now before adding each light to the buffer, clear the destination alpha to white, and use the geometry to draw black masks into the destination alpha. Then when you draw the light, multiply it against the destination alpha to black out the shadowed areas. This is how the lighting in Gish worked years ago, and doesn't require fancy hardware or algorithms.

To render the mask, you just need to turn each line segment into a quad. Two of the corners are just the endpoints of the segment, and the other two get pushed away by adding an offset. Render all the line segments this way, and you have a shadow mask!

![shadow projection](/images/lighting-2d/shadow-projection.svg)

Something like this in code:
```
quad[0] = segment[0]
quad[1] = segment[1]
quad[2] = segment[0] + 100*(segment[0] - light_position)
quad[3] = segment[1] + 100*(segment[1] - light_position)
```

This will project the shadows a finite distance from the line segment endpoints, in this case 100x further away. In another article I'll show how to do this from a shader and make it an infinite projection.

Another option is to only render the pixels where a light will shine using a [visibility polygon](https://en.wikipedia.org/wiki/Visibility_polygon) instead of masking out occluded pixels. I don't think this approach makes a lot of sense anymore though as it uses the CPU heavily instead of GPU, and is not easy to implement robustly. Sometimes people also generate visibility polygons using physics raycasts. This can be very expensive and has popping artifacts if you don't shoot enough rays.

**Pros:**
* Easy to implement.
* Pretty fast.

**Cons:**
* Requires tracing everything with polylines.
* Hard shadows look very sharp and aliased.
* Draw calls can easily get out of hand without culling.

# Soft Shadows

Soft shadows are a pretty obvious next step, but are unfortunately _much_ more difficult to achieve with good quality. In my current game, I render shadows at 1/4 resolution for performance on low end machines such as the Raspberry Pi. Though the hard shadows look passable when animated, it's not hard to prefer the soft version. :)

![hard shadows](/images/lighting-2d/shadow-hard.png)
![soft shadows](/images/lighting-2d/shadow-soft.png)

One of the first algorithms I had heard of to implement soft shadows was using [shadow fins](http://archive.gamedev.net/archive/reference/articles/article2032.html). Basically you drew hard shadows into the framebuffer's destination alpha using some variation of the hard shadowing algorithm, then you drew soft "fins" on the edges of the shadows from a texture. I was personally never happy enough with this technique to keep it around. It was too fiddly, and I never found a good way to keep the penumbra from "popping" as the fins moved from one vertex to another.

My own algorithm requires a lot of math, but almost all of the work happens in a vertex shader making it very fast. Initially written for Cocos2D-iPhone, we also made a Unity version that we sold for a while called Super Fast Soft Shadows. I plan to write an entire article on this algorithm next!

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/sZxrQHIaBbE" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

**Pros:**
* Produces great looking, fairly accurate penumbras.
* Pretty fast.

**Cons:**
* Requires a lot of math to implement correctly.

## Screen Space Lightfields

Forward and deferred rendering work with normal mapping because they treat each light individually. So when they shade a pixel, you know which direction the light is coming from. This doesn't work with screen space lightmaps because all the light gets mixed together in the buffer. Screen space lightfields fix this by storing an approximation of a lit sphere at each pixel, basically like a per-pixel lightprobe. To use it, you render the lightfield first, and then when drawing sprites you sample the lightfield and use the normal to look up the light value on that "approximately lit sphere". It even works nicely with the shadowing algorithms for lightmaps. 

![screen space lightfield](/images/lighting-2d/lightfield.png)

If you are familiar with spherical harmonic light probes, they take a lot of math to understand them, but their implementation is a just a bunch of dot products and arithmetic. My 2D probes are just a simpler, per-pixel version of that based on fourier series, and the implementation is even simpler. I've been developing Project Drift to run with full lightfields and soft shadows at 60 hz on a Raspberry Pi 4. It runs great so far. :)

**Pros:**
* Fast, simple implementation.
* Works with normal mapping and custom materials.
* Works with shadowing.

**Cons:**
* Requires multiple render targets.
* Bandwidth intensive, but can be subsampled.
* Only works with diffuse materials.
* Requires a lot of math to implement correctly.

## Light Space Shadows

There are a few shadowing algorithms I've seen ([example](http://www.catalinzima.com/2010/07/my-technique-for-the-shader-based-dynamic-2d-shadows/)) that operate in light space to generate a shadow mask directly by rendering the scene. Each light has a buffer, and the alpha of the surrounding sprites and level are rendered into it. Then the shadows are generated in texture space by smearing the alpha from the center out in multiple passes. Some people also apply some radial blur to get some simple soft shadows.

**Pros:**
* Doesn't require redundant outline data for shadow casters.

**Cons:**
* Very expensive, requiring many passes per light.

## Even more

A very old, and reliable method that's still used in some tile based games is grid based raycasting. If it was fast enough to run on an 8 bit computer, it should run on anything! Throw in some texture filtering and some multisampling and it doesn't look half bad. Take Starbound for instance:

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/F5d-USf69SU" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

Lately I've also seen people experimenting with using raymarching for 2D lighting and even 2D global illumination. The basic idea is simple enough, and there are oodles of tutorials on the subject. It's really a bit of a rabbit hole on how complicated you want to make it and how much GPU power you want to burn. It also requires representing your scenes as distance fields which is not trivial either.

## Lots of choices!

Hopefully this is a useful introduction to somebody setting out to make their own 2D lighting system. I plan to come back to this article to update and expand it. In the mean time, if there's anything obvious I'm missing, let me know!

In the next post, I'll start documenting how the soft shadow algorithm in Super Fast Soft Shadows works, and how I extended it to use lightfields for Project Drift.

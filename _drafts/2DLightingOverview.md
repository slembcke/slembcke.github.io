---
layout: post
title:  "2D Lighting Techniques"
description: "An overview of various 2D lighting techniques."
date:   2020-01-01 12:00:00 -0500
#categories: jekyll update
# permalink: 
---

<!-- * 3D lighting
	* Forward
	* Deferred
	* Need for something else?
* Simple additive lights.
* Shadow masks
	* Hard shadows
	* Stencil vs alpha vs texture
* Soft shadow masks
	* Linear subtractive penumbras -->
* Image based options
	* Radial blur
	* Polar space blur
* Visibility map
* Raycasting
* Raymarching
* Grids
* Fourier light fields


In the early 2000's I played an indie game called [Gish](http://www.chroniclogic.com/gish.htm). One of the many amazing things about the game was its 2D lighting effects. They were glorious, and I had never seen anything like them. Sure, there were a handful of 3D games by that point that did shadow mapping, but never in a 2D game.

(Gish video here)

They algorithm used is simple enough that I was able to successfully guess my way through it, and it set up a bit of a quest to perfect the technique that I would continue in the back of my mind for the next decade. Before diving into the path I took. I figure it's worth talking about the other algorithms I've seen along the way and what makes them stand out.

# Lighting for Modern 3D

While there are plenty of rendering algorithms for 3D games, broadly speaking there are 2 main categories that most algorithms are related to.

## Forward

The quintessential rendering algorithm for 3D games is forward rendering. While there are plenty of variations, the basic idea is that each light shining on an object adds to the the final pixel color. So using additive blending, you render the surface lit independently by each light, and the result is the fully lit surface. Though you can certainly find plenty of 2D games using this algorithm (most 2D games using normal mapped lighting probably), it's not in my opinion very optimal. Most 3D games consist of largely of opaque geometry and use depth buffering for hidden surface removal. In constrast, most 2D games are drawn using many alpha blended layers in a specific order. This means a lot of the batching an re-ordering optimizations available to 3D games just don't work, and you are left brute forcing your way through a large number of draw calls and pipeline state changes.

## Deferred

Another popular category of algorithms for lighting 3D games is deferred. The basic motivation is that using forward rendering, if you double the number of objects and lights in a scene, you quadruple the number of rendering passes you need. Instead of rendering fully lit surfaces, render information about the surfaces (color, normal, position, etc) to an offscreen _G buffer_. Then when you draw the lighting, you read the surface information back and accumulate. Instead of _lights * surfaces_ draw calls, you end up with _lights + surfaces_ draw calls. The downside of defered rendering is that it fundamentally only works for opaque surfaces. Transparent surfaces need to be drawn separately with a different algorithm. This is a real bummer for 2D games if you want to use alpha blended, instead of hard edged sprites, though there are a few games that put this to good use such as [Cryptark](http://www.cryptark.com/). Another issue with deferred rendering is that it limits your ability to use specific shaders on surfaces as they all get mixed together in the same G buffer.

# Simple Algorithms for 2D Lighting

## Additive Screen-Space Lightmaps

A very simple model for light is that when light bounces off a surface, some of the light is absorbed and some is reflected back off. The ratio of incoming light to outgoing light is called the albedo, and is roughly what ordinary folks mean when they say 'color'. So when you are drawing a lit sprite, if you know how much light is hitting it, you can multiply the light value with the sprite's color to get the lit color. When multiple lights shine on the same sprite, you can simply add their values together. `pixel = light1*color + light2*color + ...` This is a very simplified version of forward lighting. The trick to speeding this up, while making the implementation dead simple is to additively render the lights as sprites into a "lightmap" texture in screen space, render your scene normally, then multiply the lightmap texture over the screen. This way you end up with the equivalent `pixel = (light1 + light2 + ...)*color` As a visual explanation, consider the following images made in a photo editor.

![Add Lights]()
![Multiply Over Scene]()

This method is great because it's easy to implement in a wide variety of engines, requires no shader knowledge, and only requires blending modes and the ability to render pixels offscreen. As an effect it goes a long way, and in my opinion, anything beyond this will provide diminishing returns.

## Hard Shadows

Now that you have dynamic lights in your game, the next obvious upgrade is to add shadows. The easiest way I know of to add shadows to a 2D game is a fairly easy extension to the additive lightmap algorithm. The basic idea is that before accumulating each light into the lightmap, you first draw a shadow mask for it, then use that to block light from being added to certain pixels. A good way to do this is to extrude your collision geometry, turning each line segment into a quad. An easy way to do this is to notice that the segment vertexes get pushed away from the light's center. So all you need to do is take the offset from the light to a vertex, multiply it by some amount and add it back to the light's position. No complicated math involved. With hard shadows, you have the option of using the stencil buffer or destination alpha to store the mask on a GPU. Either works, so it just depends on what is available to you. Once you have your mask drawn, all you have to do is set up your stencil function or blend mode to mask out those pixels when accumulating light sprites.

![Shadow Mask Diagram]()

If you play through Gish, you'll notice that when a shadow gets really close to a light, sometimes it's "far" edge becomes visible onscreen? Wouldn't it be nice if there was a way to make that multiplier value infinite? There is! Basically all GPUs rely on drawing triangles using _homogenous coordinates_, and in addition to the (x, y, z) values you need to do 3D graphics, there is an additional _w_ coordinate. Skipping the details, and going straight to the good part, if you have a vertex _(x, y)_ with _w = 0_, then the final vertex will simply be a vertex at the position _(x, y)_. However, if _w = 0_ then it will represent a point infinitely far away, in the direction _(x, y)_. This is exactly what you want when rendering shadows, and you can even set up a perspective matrix to do it all in hardware on ancient fixed function GPUs.

# Soft Shadows

Armed with additive lightmaps and hard shadow masks you can make a pretty good looking game, and there are plenty of examples to prove it. The next obvious step is soft shadows, but unfortunately things start getting much harder at this point for rapidly diminishing gains.

One of the first algorithms I had heard of to implement soft shadows was using [shadow fins](http://archive.gamedev.net/archive/reference/articles/article2032.html). Basically you drew hard shadows into the framebuffer's destination alpha using some variation of the hard shadowing algorithm, then you drew soft "fins" on the edges of the shadows from a texture. I was personally never happy enough with this technique to keep it around. It was too fiddly, and I never found a good way to keep the penumbra from "popping" as the fins moved from one vertex to another.

In my own soft shadowing algorithm, I noticed that the math for a line segment's penumbra is all linear. Ultimately, what I came up with was a fairly complicated vertex shader, but a simple fragment shader. At the time I came up with it, this was great because the mobile devices I was focused on didn't have very powerful fragment shading capabilities. 

![Penumbra]()

## Image Based Methods

Another 
---
layout: post
title:  "Project Drift Job System"
date:   2020-01-01 12:00:00 -0500
categories: Drift
permalink: DriftJobs
---

# Story Time

A few years ago there was a startup called Apportable. They made tools for cross-compiling native iOS software to Android, and it worked pretty good. This was especially true for games, and so it was in their best interest to keep iOS gamedev tools healthy. After the original Cocos2D developer moved on, Apportable started funding some of the more active community members and related project such as SpriteBuilder (a Cocos2D editor), and Chipmunk2D (my 2D physics library).

![SpriteBuilder](/images/SpriteBuilderLogo.png)

Our efforts got rolled together under the banner of Cocos2D-SpriteBuilder and we released v3.0 of Cocos2D. One of the big projects I wanted to tackle next was to move to using command buffers and executing them on a dedicated rendering thread. I was told a few times that attempting to thread Cocos2D was pointless and would provide little to no performance benefit. You see Cocos2D was node based, so to do rendering it would traverse the tree calling the `draw` methods, which in turn would modify the OpenGL state and make draw calls. Serial execution and global graphics state will probably make some readers cringe in 2020, but to be fair Cocos2D was created by one guy in his spare time for a mobile device with a single core CPU running GLES 1.0. Unfortunately, by 2015 the dual core iPad 2 was the minimum spec many devs were targeting, and Cocos2D didn't really have a way of taking advantage of that second CPU core.

So I buckled down and rewrote _all_ of the rendering code to wrap it up into a command buffer, and executed it on a dedicated rendering thread. Additionally, I was able to implement automatic batching and culling. The benefit was understandably huge. :D Here's an early video of a demo we made for GDC that year. This ran on an iPad 2 with hundreds of physics backed sprites, and all sorts of other effects at 60 hz. I was quite pleased to get this sort of performance with minimal API changes.

<iframe width="560" height="315" src="https://www.youtube.com/embed/eJsnCOkG8qs" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

Unfortunately the success was short lived. Shortly after GDC that year, most of Apportable's funding went away and unfortunately the SpriteBuilder collapsed shortly after due to internal politics about how we should continue. Oh well. 

# Job System 2020

Running with a dedicated main thread and a rendering thread is so... 2010. This is 2020, and even a Raspberry Pi has 4 cores! For [Project Drift](ProjectDrift) I wanted to try something new. There's a great GDC talk by Christian Gyrling called [Parallelizing the Naughty Dog Engine Using Fibers](https://www.gdcvault.com/play/1022186/Parallelizing-the-Naughty-Dog-Engine) and it describes a neat, and relatively simple job system design. Even more fascinating is the idea of getting rid of the main thread entirely. Once you have a job system that lets you run a swath of tiny tasks and easily synchronize them into a delicate dance, what do you need a rigid main loop for?

Having recently implemented coroutines via my [Tina](/Tina) project, this sounded like too much fun to pass up! :D Originally it started as a toy project to render fractals with, but it turned out so nicely that I decided to use it in Project Drift too.

scheduler, queue, job, group

Now Project Drift is going to be a 2D game, and realistically I could probably get away with running everything single threaded. Fortunately this is a hobby project so building the engine is half the fun, even if it is overkill.

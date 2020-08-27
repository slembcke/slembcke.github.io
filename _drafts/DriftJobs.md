---
layout: post
title:  "Project Drift Job System"
date:   2020-01-01 12:00:00 -0500
categories: Drift
permalink: DriftJobs
---

![SpriteBuilder](/images/SpriteBuilderLogo.png)

I think the last time I really put multi-threading to good use in a homegrown game engine was when I was working with the SpriteBuilder team on Cocos2D 3.1. I had completely rewritten the Cocos2D rendering code to use command buffers with the intention of enabling automatic sprite batching and adding support for a rendering thread. It allowed us to get surprisingly good performance out of the otherwise stock Objective-C Cocos2D API. Even a lowly iPad 2 could have hundreds of physics backed sprites on the screen at a smooth 60 hz. Several people had voiced the opinion that attempting to multi-thread Cocos2D's rendering was a dead end, so I was pleased to be able to prove otherwise. :)

<iframe width="560" height="315" src="https://www.youtube.com/embed/eJsnCOkG8qs" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

Unfortunately the success was short lived. The SpriteBuilder project was being funded by a startup called Apportable. They made iOS to Android cross-compilation tools, and wanted high quality iOS gamedev tools to flourish. Shortly after GDC that year, most of their money dried up and the SpriteBuilder team collapsed due to internal politics.

# Job System 2020

Running with just a main thread and a rendering thread is so 2010. Even a Raspberry Pi has 4 cores in 2020! For [Project Drift](ProjectDrift) I wanted to try something new. There's a great GDC talk by Christian Gyrling called [Parallelizing the Naughty Dog Engine Using Fibers](https://www.gdcvault.com/play/1022186/Parallelizing-the-Naughty-Dog-Engine) and it describes a neat, and relatively simple job system design. Having recently implemented coroutines via my [Tina](/Tina) project, this sounded like too much fun to pass up! :D Even more fascinating is the idea of getting rid of your main thread. Once you have a job system that lets you run a swath of tiny tasks and synchronize them into a delicate dance, what do you need a rigid main loop for?

Practically the first code I wrote on top of Tina was Tina Jobs that implemented Christian's ideas as I understood them while attempting to keep the implementation as simple as possible. 

scheduler, queue, job, group

Now Project Drift is going to be a 2D game, and realistically I could probably get away with running everything single threaded. Fortunately this is a hobby project so building the engine is half the fun, even if it is overkill.

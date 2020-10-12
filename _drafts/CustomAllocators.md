---
layout: post
title:  "Custom Allocators Demystified"
description: "An introduction to the what and why of custom allocators."
date: 2020-01-01
#categories: jekyll update
# permalink: 
---

Have you ever wondered why people write their own memory allocators? Are they masochists? Do they think they can write a better memory allocator than the OS? Shouldn't they just use a garbage collected language and be done with it?

# A Better malloc()

Around 2010 or so when Chipmunk2D was new(ish), it didn't do any custom allocations. Even temporary data, was allocated when needed and freed when I was done with it. At the time I was developing it, I was using OS X, and it was more or less fine. I even has some old stress test videos on YouTube with tens of thousands of colliding objects in real time on an old Core 2 Duo machine. Running the same code on Windows XP was a bit of a turd however. Had somebody suggested using a custom allocator, I probably would have turned my nose up at the idea and said something like "That's dumb, I can do something simpler." After all I had only been looking at the sampling profiler data, and that was telling me that CPU usage of memory functions was barely 1% of my total CPU time. Besides, what I had really wanted to do was to try and pack all of my collision data together to make it cache friendly. So what I did instead was to keep pools of various types I needed. If I needed a collision pair, I would check if the collision pair pool was empty and grab one. If the pool was empty, I'd allocate a few kilobytes more of them first. I did something similar for contact data, but since it only needed to be kept for a single frame I could release entire blocks of it back to the pools at once. This solved my Windows performance problem, and made for a very nice bump in Mac/iOS performance too!

So I didn't know it at the time, but I had several reasons to want a custom allocator, and I accidentally implemented several! I didn't need something as flexible as the system allocator. I didn't need generic access to gigabytes of memory split into endlessly varying block sizes, and shared between many threads. All I needed was memory locality, and the ability to reuse a few fixed sized allocations. So while writing a better malloc is probably a lost cause, you can often write a simpler allocator once you know your data and how it's used. Additionally, with relatively little effort you can instrument your allocations to help prevent memory errors before they happen, or aid in tracking them down when they do.

Even if you use a garbage collected language, you aren't immune to these problems. Object pooling _is_ custom allocation, and it's used in garbage collected environments for many of the same reasons. Unfortunately, garbage collected languages also give you little control over memory to begin with, often making debugging and optimization much more difficult. Speaking personally, I've spent _way_ more time debugging memory usage and performance issues in garbage collected languages than I have tracking down manual memory management errors. 

# Simple Allocators

## Slab Allocator

![Slab Allocator Diagram](/images/SlabAllocator.svg)

The collision pair example from Chipmunk2D is basically a slab allocator. The idea is that your allocator just needs to keep a list of large blocks of memory (slabs) that you have allocated, and break those into little fixed sized blocks of memory for your objects that you store in a linked list of free allocations. The trick is to use the allocations themselves as linked list nodes so you don't have to waste any extra memory for tracking. Allocating memory becomes as fast as pushing or popping nodes onto a linked list, and you only have to talk to the OS when you run out of space in your existing slabs. Additionally, all of the memory is packed together which helps play nice with the CPU cache. As a final bonus, since you aren't mixing large and small allocations together in the system allocator, you can know that you are minimizing fragmentation.

**When to use it:** When you need to keep a pool of allocations that are all the same size.

## Linear Allocator

![Linear Allocator Diagram](/images/LinearAllocator.svg)

Linear allocators (sometimes called bump allocators) are one of the simplest and most useful custom allocators. The short version: Given a block of memory, start at the beginning and make allocations one after another. When you are done with all the allocations, free or reuse the block. In a production allocator, you probably need to deal with alignment, overflow, and out of memory issues, but none of that is particularly complicated. Linear allocators are great when you need scratch memory to build a temporary data structure, or otherwise know that all the data you are allocating has a finite lifespan such as the end of a user input event in a GUI, or the end of a frame in a game. Not only does your data end up well packed, but the actual cost of the allocation is a tiny bit of arithmetic, and deallocation is basically free! The biggest downside of linear allocators is that you need to know the worst case memory usage up front.

**When to use it:** When you need fast temporary memory with a finite lifespan.

## Zone Allocator

![Zone Allocator Diagram](/images/ZoneAllocator.svg)

Zone allocators (sometimes called area allocators) make linear allocators more flexible by relaxing the upfront memory allocation. Instead of a single block of memory, you make a series of linear allocators. Whenever one runs out of space, allocate another block and use that. All you need to do is keep a list of the blocks you allocate so they can be freed (or returned them to a pool) when you are done with the zone. This is exactly what I unknowingly implemented for Chipmunk2D's contact data.

Zone allocators are pretty simple to extend to be thread safe as well. Instead of a single linear allocator you make one per thread as needed. Only the list of blocks shared by the zone's linear allocators needs to be protected by a mutex.

**When to use it:** When you need fast temporary memory with a finite lifespan, but don't know how much you'll need.

## Buddy Block Allocator

The buddy block allocator is the fanciest allocator I've personally implemented. It's pretty generic, and exactly the sort of thing I thought would be a waste of time all those years ago. On the other hand it's not particularly complicated, and my implementation is barely 200 sloc. The basic idea is that you start with a large block of memory that you want to split up, and when you make allocations you recursively break the block into halves until you have the size you need. Since sub-blocks are always broken into pairs (buddies), it's easy to figure out the location of any given block's buddy with a little math. When freeing a block, you can easily check if the buddy is free and join them back together into a larger block.

I can't succinctly describe the whole algorithm in a paragraph, but there are plenty of articles on the internet if you want a clearer picture.

**When to use it:** When you need a fast, general purpose allocator with predictable performance.

Simplicity
"Garbage Collection"
Cache Performance
Threading
Debugging
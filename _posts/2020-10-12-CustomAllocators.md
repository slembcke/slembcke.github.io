---
layout: post
title:  "Custom Allocators Demystified"
description: "An introduction to the what and why of custom allocators."
date: 2020-10-12
permalink: Custom-Allocators
---

Have you ever wondered why people write their own memory allocators? Are they masochists? Do they think they can write a better memory allocator than the OS? Shouldn't they just use a garbage collected language instead?

## Why bother with custom allocators?

Around 2010 or so when Chipmunk2D was new(ish), it didn't use any custom allocators. Even temporary data was allocated when needed, tracked, and freed when I was done with it. At the time I was developing it, I was using OS X, and this was more or less fine. I even have some old stress test videos on YouTube with tens of thousands of colliding objects in real time on an old Core 2 Duo laptop. Running the same code on Windows XP wasn't so great however. Had somebody suggested using a custom allocator, I probably would have turned my nose up at the idea and said something like "That's dumb, I can do something simpler." Besides, looking at sampling profiler data on OS X was telling me that memory functions weren't even 1% of the CPU time after all. Why bother trying to make the allocator more efficient? On the other hand I knew what I had really wanted to do was to try and pack all of my collision data together to make it cache friendly. So what I did was to keep pools of various types of structs. If I needed a collision pair struct, I could just grab one from the pool. If the pool was empty, I'd allocate a few more kilobytes of them in a big block first. I did something similar for contact data, but since it only needed to be kept for a single frame I could release entire blocks of it back to the pools all at once. This solved my Windows performance problem, and the locality made for a very nice performance bump on other platforms too!

The astute reader is probably performing a face palm right now as I've just described a slab allocator and a zone allocator. :)

### No need for a better `malloc()`

So what does `malloc()` give us anyway?

* Access to nearly unlimited amounts of virtual memory
* Create or free individual allocations of any size
* Safe, transparent access to allocations from any thread

These are all great features, and it would be difficult to implement a reasonably generic replacement. On the other hand, many programs and systems within them have unique memory requirements. For Chipmunk2D's collision system what I needed was completely different:

* Memory locality
* Predictable performance
* Simplified memory ownership

So while I didn't know it at the time, I had several reasons to want a custom allocator, and I accidentally implemented several! The last item in particular is interesting to me because it's completely antithetical to what I used to think custom allocators were all about. I had a model in my head where custom allocators were about performance, and garbage collection to be about simplifying ownership, but it turns out the two are not so mutually exclusive. Using some custom allocator techniques in a garbage collected language can improve performance, and using them in a traditional language can give many of the same benefits as if you had garbage collection.

### More reasons to bother with custom allocators

Over the years, I've wasted _many_ hours debugging memory issues. With just a hash table and a set of linked lists, you can track the history of all your allocations. That makes it pretty easy to track down use after free errors, double free errors, and memory leaks. Using guard pages around your allocations, you can detect overflows. Techniques like this can be a nice complement to external tools like Valgrind or AddressSanitizer. Between the simplified memory ownership, having tools to help detect errors, and tools to debug issues when they do occur, I can happily say I haven't spent a lot of time debugging memory issues for years. :)

## Common Allocators

Several of the common allocators you hear people talk about are so simple, you can describe them in a paragraph! (Though I'm going to cheat and use diagrams too.)

### 1) Slab Allocator

![Slab Allocator Diagram](images/SlabAllocator.svg)

The collision pair example from Chipmunk2D is basically a slab allocator. The idea is that your allocator just needs to keep a list of large blocks of memory (slabs) that you have allocated, and break those into little fixed sized blocks of memory for your objects that you store in a linked list of free allocations. The trick is to use the allocations themselves as linked list nodes so you don't have to waste any extra memory for tracking. Allocating memory becomes as fast as pushing or popping nodes onto a linked list, and you only have to talk to the OS when you run out of space in your existing slabs. Additionally, all of the memory is packed together which helps play nice with the CPU cache. As a bonus, you know for sure that you are packing small, short lived allocations together and minimizing fragmentation of your main memory space.

**When to use it:** When you need to keep a pool of short lived allocations that are all the same size.

### 2) Linear Allocator

![Linear Allocator Diagram](images/LinearAllocator.svg)

Linear allocators (sometimes called bump allocators) are one of the simplest and most useful custom allocators. The short version: Given a block of memory, start at the beginning and make allocations one after another. When you are done with all the allocations, free or reuse the block. Generally speaking you also need to deal with alignment, overflow, and out of memory issues, but none of that is particularly complicated. Linear allocators are great when you need scratch memory to build a temporary data structure, or otherwise know that all the data you are allocating has a finite lifespan. This works well when processing a user input event in a GUI, or a frame in a game. Not only does your data end up well packed for the CPU cache, but the actual cost of the allocation is just a tiny bit of arithmetic, and deallocation is basically free! The biggest downside of linear allocators is that you need to know the worst case memory usage up front.

**When to use it:** When you need fast temporary memory with a finite lifespan.

### 3) Zone Allocator

![Zone Allocator Diagram](images/ZoneAllocator.svg)

Zone allocators (sometimes called arena allocators) make linear allocators more flexible by relaxing the upfront memory allocation. Instead of a single block of memory, you make a series of linear allocators. Whenever one runs out of space, allocate another block and switch to it. Then all you need to do is keep a list of the blocks you allocate so they can be freed (or returned to a pool) when you are done with the zone.

Zone allocators are pretty simple to extend to be thread safe as well. Instead of a single linear allocator you can make one per thread as needed. Only the list of blocks shared by the zone's linear allocators needs to be protected by a mutex.

**When to use it:** When you need fast temporary memory with a finite lifespan, but don't know how much you'll need.

### 4) Buddy Block Allocator

The buddy block allocator is the fanciest allocator I've personally implemented. It's pretty generic, and is exactly the sort of thing I thought would be a waste of time all those years ago. On the other hand it's not particularly complicated, and my own implementation is barely 200 sloc. The basic idea is that you start with a large block of memory that you want to split up, and when you make allocations you recursively break the block into halves until you have the size you need. Since sub-blocks are always broken into pairs (buddies), it's easy to figure out the location of any given block's buddy with a little math. When freeing a block, you can easily check if the buddy is free and join them back together into a larger block.

While I can't succinctly describe the whole algorithm in a paragraph, there are plenty of articles on the internet if you want a clearer picture. Also, keep in mind that while this is a pretty generic algorithm that you really _could_ replace malloc() with, you might want to have a pretty good idea of why you'd want to. Maybe you have some strong latency constraints (audio, graphics, etc), or maybe you are allocating something that isn't regular memory (ex: Vulkan memory). I've only used my implementation in a real-time audio synthesizer, but it would have been fine without it too. It was for a hobby project, and it was fun. :)

**When to use it:** When you need a general purpose allocator with predictable performance.

## Why not bother with custom allocators!

Hopefully I've convinced somebody that custom allocators aren't a terrible idea after all, and given them some terms to search for more information.

Happy allocating! :)

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

Around 2010 or so when Chipmunk2D was new(ish), it didn't do any custom allocations. Even temporary data, was allocated when needed and freed when I was done with it. At the time I was developing it, I was using OS X, and it was more or less fine. I even has some old stress test videos on YouTube with tens of thousands of colliding objects in real time on an old Core 2 Duo machine. Running the same code on Windows XP was a bit of a turd however. Had somebody suggested using a custom allocator, I probably would have turned my nose up at the idea and said something like "That's dumb, I can do something simpler." After all I had only been looking at the sampling profiler data, and that was telling me that CPU usage of memory functions was barely 1% of my total CPU time. Besides, what I had really wanted to do was to try and pack all of my collision data together to make it cache friendly. So what I did instead was to keep pools of various types I needed. If I needed a collision pair, I would check if the collision pair pool was empty and grab one. If the pool was empty, I'd allocate a few kilobytes more of them first. This solved my Windows performance problem, and made for a very nice bump in Mac/iOS performance too!

So I didn't know it at the time, but I had several reasons to want a custom allocator, and I accidentally implemented one. I didn't need something as flexible as the system allocator. I didn't need generic access to gigabytes of memory split into endlessly varying block sizes, and shared between many threads. All I needed was memory locality, and the ability to reuse a few fixed sized allocations. So while writing a better malloc is probably a lost cause, you can often write a simpler allocator once you know your data and how it's used. Additionally, with relatively little effort you can instrument your allocations to help prevent memory errors before they happen, or aid in tracking them down when they do.

Even if you use a garbage collected language, you aren't immune to these problems. Object pooling _is_ custom allocation, and it's used in garbage collected environments for many of the same reasons. Unfortunately, garbage collected languages also give you little control over memory to begin with, often making debugging and optimization much more difficult. Speaking personally, I've spent _way_ more time debugging memory usage and performance issues in garbage collected languages than I have tracking down manual memory management errors. 

# Simple Allocators



## Slab Allocator

The collision pair example from Chipmunk2D is basically a slab allocator. The idea is that your allocator just needs to keep a list of large blocks of memory (slabs) that you have allocated, and break those into little fixed sized blocks of memory for your objects that you store in a linked list of free allocations. The trick is to use the allocations themselves as linked list nodes so you don't have to waste any extra memory for tracking. Allocating memory becomes as fast as pushing or popping nodes onto a linked list, and you only have to talk to the OS when you run out of space in your existing slabs. Additionally, all of the memory is packed together which helps play nice with the CPU cache. As a final bonus, since you aren't mixing large and small allocations together in the system allocator, you can know that you are minimizing fragmentation.

**When to use it:** When you need to keep a finite pool of allocations that are all the same size.

## Linear Allocator

Linear allocators (sometimes called bump allocators) are one of the simplest and most useful custom allocators. The short version: Given a block of memory, start at the beginning and make allocations one after another. When you are done with all the allocations, free or reuse the block. In a production allocator, you probably need to deal with alignment, overflow, and out of memory issues, but none of that is particularly complicated. Linear allocators are great when you need scratch memory to build a temporary data structure, or otherwise know that all the data you are allocating has a finite lifespan such as the end of a user input event in a GUI, or the end of a frame in a game. Not only does your data end up well packed, but the actual cost of the allocation is a tiny bit of arithmetic, and deallocation is free! The biggest downside of linear allocators is that you need to know the worst case memory usage up front.

**When to use it:** When you need fast temporary memory with a finite lifespan.

## Zone Allocator

Zone allocators (sometimes called area allocators) make linear allocators more flexible by relaxing the upfront memory allocation. Zone allocators keep a list of blocks, and works on them like a linear allocator. When a block fills up, it asks the system for another one. Like a linear allocator, you can't deallocate individual allocations, but you can quickly free the whole zone by returning its blocks to the system.

**When to use it:** When you need fast temporary memory with a finite lifespan, but don't know how much you'll need.

## Buddy Block Allocator

Weighing in at a whopping ~200 sloc, the Buddy Block allocator is the most complicated custom allocator I've personally used. It's a simple, but fairly general purpose allocator. The basic idea is that you start with a large block of memory that you want to split up, and when you make allocations you recursively break the block into sub-blocks until you have the size you need. Since sub-blocks are always broken into pairs (buddies), with some math tricks it's easy to figure out the location of any given block's buddy. That means that when freeing a block, if its buddy is also free, then you can join them back together into a super-block so that you won't run out of larger blocks to allocate from later. Since there are plenty of other articles around the internet to get a clearer picture if you are interested in the details. The biggest downside of the buddy block allocator is that it has some bookkeeping overhead for every block you allocate. It's not a lot (I think a bit or two per block), but that adds up to a lot if your minimum block size is small.

The benefits to using a buddy block allocator over the system allocator seems pretty limited. If you had a use case for a custom, general purpose allocator like this, you probably don't need me to tell you about it. ;)

** When to use it:** When you need a fast, general purpose allocator that's under your control.

Simplicity
"Garbage Collection"
Cache Performance
Threading
Debugging
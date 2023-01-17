---
layout: post
title: "AABB Tree Shootout"
description: "A performance comparison of several AABB Tree implementations."
date: 2023-1-17
permalink: TreePerf
---

This article is going to be about exploring and comparing the performance if several different AABB tree types, and isn't meant to be an introduction to the topic. I assume the reader is familiar with AABB trees, or at least bounding volume hierarchies in general. In particular, I'll be comparing the (binary) AABB trees from [Box2D](https://github.com/erincatto/box2d) (written by [Erin Catto](https://mastodon.gamedev.place/@erin_catto)) and [Chipmunk2D](https://github.com/slembcke/Chipmunk2D) (written by [myself](https://mastodon.gamedev.place/@slembcke)), and the R-tree I made for my new game [Veridian Expanse](https://github.com/slembcke/veridian-expanse).

## AABB Trees

As a quick refresher, AABB trees are a type of bounding volume hierarchy where each node in the tree is a bounding box that contains smaller bounding boxes, until you get to the leaves of the tree where the actual objects you want to work with live. They are fairly easy to work with, and can provide a decent performance increase for collision detection without a lot of code.

![Example BVH](images/tree-perf/bvh-example.svg)

<a href="https://commons.wikimedia.org/wiki/File:Example_of_bounding_volume_hierarchy.svg">Schreiberx</a>, <a href="https://creativecommons.org/licenses/by-sa/3.0">CC BY-SA 3.0</a>, via Wikimedia Commons

# Box2D's [b2DynamicTree](https://github.com/erincatto/box2d/blob/main/src/collision/b2_dynamic_tree.cpp)

First up, lets talk about Box2D's implementation since it's a bit simpler. It's a pretty classic binary AABB tree where each node has two children. To make updating the positions of existing objects in the tree faster, b2DynamicTree works incrementally. Every object has it's bounding box expanded into a "fat" version that allows the object to move for a few frames before requiring it to be updated. This expansion includes extending the box in the direction it's moving, and some additional padding around all sides. When on object moves outside of this "fat" bounds, it's removed from the tree and reinserted. I'm not sure who came up with the idea, but it's pretty standard and reliable. To build a list of collision pairs, Box2D queries each dynamic object against the tree and filters out the invalid pairs. For example, every object will find itself as a potential collision, and everything else comes in pairs (A vs B is the same as B vs A).

An issue with expanded bounds is that the extrusion amount as well as the padding requires some (compile time) tuning. For example, on a particular data set I average 45 ms to update and generate collision pairs for a large number of objects. If I slow down the movements to 1/10 their normal speed then it takes 42 ms to run, but if I speed them up by 10x then it takes 120 ms. Similarly, if I make the objects 10x larger in size then it takes 41 ms to run, but if I make them 1/10th the size then the runtime jumps to 280 ms. Box2D has a partial solution to this by encouraging the user to use SI units so that default tuning values can be chosen to correspond to reasonable tolerances of real world objects.

# Chipmunk's [cpBBTree](https://github.com/slembcke/Chipmunk2D/blob/master/src/cpBBTree.c)

Chipmunk can use several different spatial indexing structures, though the default is a binary AABB tree similar to Box2D's. When I implemented it, I read up on the AABB trees used in Box2D and Bullet Physics, and started out with similar features. The original spatial index I used in Chipmunk was a spatial hash which had _fantastic_ performance when you had objects that were roughly the same size and [tuned the parameters to match](https://chipmunk-physics.net/release/ChipmunkLatest-Docs/#cpSpace-SpatialHash). On the other hand, it didn't work so great when objects varied wildly in size, and users were often confused what the tuning parameters were for. I was hoping for a silver bullet when I started implementing my AABB tree. Something that would be as fast or faster than the spatial hash without requiring the turing parameters that led to so many questions on the forums. It didn't work. :(

Sometimes the tree was faster, and sometimes the hash was faster, and I'd felt like I'd just yet implemented another tuning parameter by letting the user pick which index to use. That's when I came up with the idea to do collision caching. Basically the idea was to memorize all the collision pairs and connect them into a web of "threads" as I called them in the code. Imagine a doubly-linked list for each object, and each node in the list is a collision pair it's involved in. The trick to make this work was that it was something more akin to a quadruply linked list with next/prev pointers for each object in the pair. Instead of updating the tree then querying each object, cpBBTree updates the tree while updating the collision cache, then iterates the collision cache. This made the tree faster in nearly every test case I threw at it, and I made it the default. As for the tuning parameters, I implemented the padding as a percentage instead of a fixed value. This relaxed the scaling requirement, and expanding all bounds by 10% seemed to work somewhat optimally from the testing I tried. I also extruded the paths by a hard-coded 0.1 seconds. It had some minor impact on performance, but didn't seem worth exposing it.

The same simulation that took 45 ms to run with b2DynamicTree takes 12 ms to run using cpBBTree. I attribute most of this to the collision caching, but I fused the loops together, so It's difficult to know for sure. Like Box2D, Chipmunk's performance changes with relative object speeds. If I decrease the speed of the objects to 1/10th then the cache works great and the tree does very little work, running in only 6 ms. However, increasing the speed by 10x makes the cache worthless. The bounding boxes are expanded so much that it just gets clogged up with false positives (I think) and jumps to a whopping 284 ms. Another issue with the collision caching is it's performance has a high variance, making it somewhat unpredictable. It would certainly lose some of it's advantage if comparing 90% percentiles for instance.

## A Different Decade

Both Box2D's and Chipmunk's AABB trees were designed in a different era and computers have changed again! (or at least my understanding has) I've soured significantly on binary trees. They are _terrible_ for causing CPU cache misses as the information density is so low. The spatial information in them gets spread across many nodes also, and it makes it very difficult to balance their heights or optimize their geometric structure. They worked fine in 201X, but in 202X I think we need a better way.

It was Sebastian Sylvan's [GDC talk](https://www.gdcvault.com/play/1012255/contactUs) and accompanying [blog post](https://www.sebastiansylvan.com/post/r-trees--adapting-out-of-core-techniques-to-modern-memory-architectures/) that first turned me towards R-trees. I was vaguely aware of them for GIS use cases, but had never really considered them to be useful for real-time uses. Basically instead of just 2 children, a node can have dozens of children. This means you can put all the child bounds in a big cache friendly block, and when splitting a node you actually have some spatial information to use. The high branching factor also makes them quite short, and their height is even somewhat self balanced.

# Veridian Expanse's [DriftRTree](https://github.com/slembcke/veridian-expanse/blob/master/src/base/drift_rtree.c)

For the "drift" engine that my new game, Veridian Expanse, is built on I wanted to try out new ideas instead of just using Chipmunk. I wrote the physics for it from scratch in a data-oriented fashion and it was time to try an R-tree. Following some of Sebastian's advice worked pretty well to start. DriftRTree isn't very advanced yet functionality wise yet, but it is _fast_. Running the same test setup as before, it takes 14 ms to run. This is a bit worse than cpBBTree at first glance, but it has much lower variance. Additionally, it's unaffected by scale, and nearly unaffected by velocity. It's _very_ predictable. I also took it as an opportunity to try threaded collision pair generation which brings the time down to 3 ms. Updating the tree is still serial however. More on that later.

## What's the Simulation?

I've mentioned a "test setup" multiple times so far. It isn't anything too fancy, ~40k dynamic circles with a blue noise distribution packed into a small square, generating about 15k collisions each frame. I chose this because it emphasized a large number of dynamic bodies in a simple deterministic setup while trying to avoid pathological cases like slow-moving objects that cpBBTree very quite good at. I hashed the collision pair results of all the spatial indexes to verify they were getting the same results (order independent). The following video is a slightly samller example iwth ~10k objects. The full size test is twice the size, but rotating at the same speed. This is surely a bit of a flawed micro-benchmark, but it will have to do for now.

 <video width="320" height="240" controls>
  <source src="images/tree-perf/rotating-bounds.m4v" type="video/mp4">
  Your browser does not support the video tag.
</video>

Without further ado, here's what sort of performance the different indexes get under various object loads. Note the log scales on _both_ axes!

![timings](images/tree-perf/timings.svg)

I think it's really interesting how well just brute forcing the collision pairs works, O(n^2) style. It's basically your _best_ option up until you have a few hundred objects. I'd have to pull out some old hardware to check, but I don't think the graph would look like this a decade or two ago. Superscalar CPU pipelining magic! I've told people a few times in the last 5 years or so not to be afraid to try brute forcing a problem if it can fit in a few kilobytes of RAM. It can be really hard to beat!

One thought I have is that if the difference between the Box2D and the Chipmunk line is the collision caching, imagine what it would look like to apply that to the R-tree. Additionally, the Chipmunk implementation has aged like milk. Each node in the cache is 6 pointers, and on a 64 bit machine that's basically a full cache line each. Last time I looked at it in a profiler most of the time in it was spent waiting for memory reads! I can imagine a more cache friendly version of this together with the R-tree really flying. Unfortunately it's a _very_ serial algorithm as far as I can fathom it.

So then my other thought is how well threading the R-tree collisions works. It's so much faster than the other options for large numbers of objects. It could be even faster too as the update phase is still serial. Look at all the empty space in it's CPU trace as all the CPUs wait for the update!

![R-tree CPU trace](images/tree-perf/rtree-trace.png)

## Future Directions

I have no use for a faster R-tree in Veridian expanse, but I'm still very interested in seeing how fast it can be. Updating the leaves in parallel should be easy enough, and pipelining it with the bounds generation should be possible too without an explicit sync point. Updating the internal nodes could probably be batched if they maintained a topological sort, and the reinsertions could be batched too. It's a lot of syncs though... Anyway, there more to do here, and I'm keen to keep digging. :)

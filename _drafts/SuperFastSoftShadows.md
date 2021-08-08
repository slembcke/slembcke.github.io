---
layout: post
title: "2D Lighting with Soft Shadows"
description: "Extending the hard shadow technique with accurate penumbras."
date: 2021-08-04 12:00:00 -0500
#categories: jekyll update
permalink: SuperFastSoftShadows
---

<!--
Introduction to soft shadows w/ diagram
Soft shadows via subtraction
Packing the vertex data
Expanding the geometry for the penumbra
Penumbra gradients
Penumbra matrices
Clipping values
Light penetration

Gradient precision issues
Fixing negative HDR mask values
-->

<canvas id="glcanvas" width="640" height="480"></canvas>
<script src="/js/lighting-2d/soft-shadows.js" defer></script>
[WebGL example source code](/js/lighting-2d/soft-shadows.js)

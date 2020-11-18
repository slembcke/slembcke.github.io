---
layout: post
title:  "Project Drift Graphics Abstraction"
description: "An overview of my custom renderer in Project Drift"
date:   2020-01-01 12:00:00 -0500
categories: Drift
# permalink: 
---

![Project Drift screenshot](/images/DriftGraphicsAbstraction/Key.png)

## Story Time

A few years ago there was a startup called Apportable. They made tools for cross-compiling native iOS software to Android, and it worked pretty good. This was especially true for games, and so it was in their best interest to keep iOS gamedev tools healthy. After the original Cocos2D developer moved on, Apportable started funding some of the more active community members and related project such as SpriteBuilder (a Cocos2D editor), and Chipmunk2D (my 2D physics library).

![SpriteBuilder](/images/SpriteBuilderLogo.png)

Our efforts got rolled together under the banner of Cocos2D-SpriteBuilder and we released v3.0 of Cocos2D. One of the big projects I wanted to tackle next was to move to using command buffers and executing them on a dedicated rendering thread. I was told a few times that attempting to thread Cocos2D was pointless and would provide little to no performance benefit. You see Cocos2D was node based, so to do rendering it would traverse the tree calling the `draw` methods, which in turn would modify the OpenGL state and make draw calls. Serial execution and global graphics state will probably make some readers cringe in 2020, but to be fair Cocos2D was created by one guy in his spare time for a mobile device with a single core CPU running GLES 1.0. Unfortunately, by 2015 the dual core iPad 2 was the minimum spec many devs were targeting, and Cocos2D didn't really have a way of taking advantage of that second CPU core.

So I buckled down and rewrote _all_ of the rendering code to wrap it up into a command buffer, and executed it on a dedicated rendering thread and explicit graphics state objects. Additionally, I was able to implement automatic batching and culling. The benefit was understandably huge. :D Here's an early video of a demo we made for GDC that year. This ran on an iPad 2 with hundreds of physics backed sprites, and all sorts of other effects at 60 hz. I was quite pleased to get this sort of performance with minimal user API changes. Eventually I even made an optional Metal based renderer as too.

<iframe width="560" height="315" src="https://www.youtube.com/embed/eJsnCOkG8qs" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

Unfortunately the success was short lived. Shortly after GDC that year, most of Apportable's funding went away and unfortunately the SpriteBuilder collapsed shortly after due to internal politics about how we should continue. Oh well.

## Why Another renderer?

After Cocos, 

## Rendering Code Example

Skipping the initialization code for the moment, lets dive straight into a rendering example. Rendering to an offscreen texture, then blitting that to the screen.

```c
// Ask the system to prepare to draw a frame.
// The 'Renderer' is basically a command buffer + vertex/index/uniform buffer.
DriftGfxRenderer* renderer = DriftAppBeginFrame(app, ...);

// As a 2D game, Project Drift doesn't have much use for static buffers.
// Instead, everything is streamed per frame through memory mapped buffers.
// First let's copy the global uniforms to the GPU. (view/proj matrix, etc)
// This is basically a memcpy() directly into a mapped GPU buffer.
glbl_bind = DrifGfxRendererPushUniform(renderer, &globals, sizeof(globals));
// Instancing is heavily used for sprites, so we need to set up a quad to reuse.
vert_bind = DriftGfxRendererPushGeometry(renderer, verts, sizeof(*verts));
// Alternatively, you can copy (or marshal) directly into the buffers yourself.
index_bind = DriftGfxRendererPushIndexes(renderer, NULL, sizeof(*indexes));
memcpy(index_bind.ptr, indexes, sizeof(*indexes));

// With the shared data out of the way, we can get ready to draw.
// Bind the offscreen buffer and clear it to black.
DriftVec4 black_color = {0, 0, 0, 1};
DriftGfxPushBindTargetCommand(renderer, color_buffer_target, black_color);

// When drawing sprites as instances, you can draw an entire batch in one draw.
// Hello again DriftGfxRendererPushGeometry() to buffer the instance data.
spr_bind =  DriftGfxRendererPushGeometry(renderer, sprites, sizeof(*sprites));

// My pipelines are basically a direct wrapper of Vulkan pipelines.
// They do a lot of backend work, but basically provide a combo of:
// 1) Shader + I/O setup (attribs, bindings, etc)
// 2) Blend + cull modes.
bindings = DriftGfxPushBindPipelineCommand(renderer, sprite_pipeline);
// Now we need to setup the pipeline's bindings.
bindings->vertex = vert_bind;
bindings->instance = spr_bind;
bindings->uniforms = uni_bind;
bindings->uniforms[0] = glbl_bind;
bindings->samplers[0] = bilinear_sampler;
bindings->textures[0] = sprite_atlas;

// With the binding done, we can make a draw call for the entire sprite batch.
DriftGfxPushDrawIndexedCommand(renderer, index_bind, vertex_count, count);

// Now we need to copy the offscreen buffer to the screen.
// Binding a 'NULL' target means to draw directly to the presentation surface.
DriftGfxPushBindTargetCommand(renderer, NULL, black);
// Make a familiar bind/draw call.
bindings = DriftGfxPushBindPipelineCommand(renderer, sprite_pipeline);
bindings->vertex = vert_bind.bindings;
bindings->instance = spr_bind.bindings;
bindings->samplers[0] = bilinear_sampler;
bindings->textures[0] = offscreen_buffer_texture;
DriftGfxPushDrawIndexedCommand(renderer, index_bind, vertex_count, 1);

// Lastly, we hand the renderer back to the system and present it.
DriftAppPresentFrame(app, renderer);
```

Though vastly simpler than GL or Vulkan, it's still admittedly pretty verbose when all you want to do is draw a bunch of quad instances over and over. In my actual code, all of that shared state is tucked behind a single `bindings = draw_quads(pipeline, count)` call. So all I need to do is fill in a couple of the unique slots on the bindings for textures and local uniform values. That makes it pretty easy to buffer and draw lots of things. :)

## Initialization

Since it's trying to be a vaguely good modern API citizen, there is a fair amount of init work so that it doesn't have to clutter up the runtime API. To keep the code simple, there are relatively few functions, and like Vulkan you have to pack structs full of options. Unlike Vulkan, I kept my feature set pretty small so there aren't a bajillion required options to set up.

Also since I have both a GL and Vulkan implementation, I have one of those dirty plain C dispatch table thingies. I can hear some of you cringing already. Fortunately it's the only place in my game I've needed to do this, and it has a half dozen functions. It's not so bad. ;)

Here's an example of creating a 

```c
// I've been a huge fan of C99 initializer lists for a long time.
// It might be one of my favorite initializer syntaxes ever really...
DriftGfxTextureOptions texture_options = {
	// Name is used as a debug label. Shows up in RenderDoc for instance.
	.name = "color_buffer",
	.type = DRIFT_GFX_TEXTURE_TYPE_2D,
	.format = DRIFT_GFX_TEXTURE_FORMAT_RGBA16F,
	.render_target = true,
};

texture = driver->new_texture(driver, width, height, texture_options);

// I often use initializer lists directly to emulate named arguments.
// Slightly verbose, but super handy. :D I stole this trick from @FlohOfWoe.
render_texture = driver->new_target(driver, (DriftGfxRenderTargetOptions){
	.name = "color_target",
	.load = DRIFT_GFX_LOAD_ACTION_CLEAR,
	.store = DRIFT_GFX_STORE_ACTION_STORE,
	// Did you know you can have complex initializers like this?
	// I didn't until a couple years ago. Super handy.
	// Also learned this from @FlohOfWoe. :)
	.bindings[0].texture = texture,
});
```

Here's an example of how I initialize shaders/pipelines.

```c
// Another options struct to fill.
// Probably the most complicated part of my renderer. So no too bad. :)
DriftGfxShaderDesc sprite_shader_desc = {
	// Vertex bindings. (Really just used to pass in the non-instanced quad UVs)
	.vertex[0] = {.type = DRIFT_TYPE_FLOAT32_2,},
	.vertex_stride = sizeof(Vec2),
	
	// Instance attribute bindings. (Note the .instanced = true)
	.vertex[1] = {.type = DRIFT_TYPE_FLOAT32_4, .offset = offsetof(Sprite, matrix) + 0x00, .instanced = true},
	.vertex[2] = {.type = DRIFT_TYPE_FLOAT32_2, .offset = offsetof(Sprite, matrix) + 0x10, .instanced = true},
	.vertex[3] = {.type = DRIFT_TYPE_UNORM8_4, .offset = offsetof(Sprite, color), .instanced = true},
	.vertex[4] = {.type = DRIFT_TYPE_U8_4, .offset = offsetof(Sprite, frame) + 0x0, .instanced = true},
	.vertex[5] = {.type = DRIFT_TYPE_U8_4, .offset = offsetof(Sprite, frame) + 0x4, .instanced = true},
	.instance_stride = sizeof(Sprite),
	
	// No layout qualifiers for other bindings in GL3, so they need to be named.
	.uniform[0] = "DriftGlobals",
	.sampler[0] = "DriftNearest",
	.texture[0] = "DriftAtlas",
};

// More on shader files later...
sprite_shader = driver->load_shader(driver, "filename", sprite_shader_desc);

// Finally ready to initialize a pipeline object.
sprite_pipeline driver->new_pipeline(driver, (DriftGfxPipelineOptions){
	.shader = sprite_shader,
	.blend = &DriftGfxBlendModePremultipliedAlpha,
	.target = render_texture,
	.cull_mode = DRIFT_GFX_CULL_MODE_NONE
});
```

That's pretty much it for shader setup. It's definitely the most tedious part of shader programming. I tried to keep it as simple as possible, but without taking away the power to pack my own attribute data like I want. Seems to work out ok.

## Shaders!? Spir-V to the rescue! :D

So I'm not actually a huge fan of GLSL. 99% of the time vertex and fragment shaders come in matched pairs, and splitting them into separate files doesn't really make sense. I also have a fair amount of shared code to make the lighting work, and GLSL really doesn't have a way to link multiple files or do includes.

HLSL kinda mostly solves all these issues. It can do includes, and you can stick your shaders together in the same file and share definitions. I like it well enough, and `spirv-cross` actually made the whole process really easy, and there were only a couple of gotchas I ran into.

### Layout Oualifiers

The first issue was how to get HLSL to bind vertex attributes to GL/Vulkan locations. I had to dig a bit to figure this one out, but `glslangValidator` supports a few custom qualifiers you can put on your variables, and one of them is for GLSL's location qualifier. Easy peasy! Stick it behind a macro and you are good to compile it for DirectX too.

```hlsl
struct VertInput {
	[[vk::location(0)]] float2 uv;
```

### Row Major or Column Major?

Next up was how to get my matrices to work. After some mild fiddling, I found a satisfactory way to pack my 2x3 affine transforms and pass them to HLSL using the standard `row_major` qualifier. I suppose this will be different for a 3D project, but there are options.

```hlsl
cbuffer DriftGlobals : register(b0) {
	row_major float2x4 DRIFT_MATRIX_V;
```

### Binding Locations

Did you spot the `register(b0)` qualifier above? You can use the standard HLSL syntax for that. You _must_ use unique indexes even if they are different types however (buffer, sampler, texture, etc). I found out the hard way that from Vulkan all the register types are mapped into the same indexes. It was pretty confusing before I had Vulkan Validations working. O_o

### Texture/Sampler Names

Other than the register index issue above, binding samplers and textures in Vulkan is straightforward. On the GL side, it's sort of a clusterflush though. Since GLSL doesn't support separate textures/samplers, `spirv-cross` "helpfully" clumps them together for you. I mean, I don't know what it's supposed to do, but I wish the format was a little more controllable. I was pretty adamant about using proper samplers finally, so I dealt with it.

For example: `SPIRV_Cross_CombinedDriftAtlasDriftNearest`

You need to chop off the 'SPIRV_Cross_Combined', then know to separate 'DriftAtlas' from 'DriftNearest'. Not so bad, just annoying.

## Texture Streaming

Since one of the main features I wanted in the game was to have large scale deformable terrain, I implemented asynchronous texture streaming. This lets me quickly re-upload dirty tiles, and stream them in as needed into a relatively small cache. I kept the implementation simple by replacing whole textures, or array texture slices at once. Other than adding a ring buffer for the queue, it turned out to be a pretty trivial change to the regular synchronous texture loading I had, so I just replaced it. Internally my implementation is just a fixed size buffer and a set of job fences.

Mildly related, the terrain density texture is one of the few textures in the game that I linearly sample since I really didn't want to use tile maps. So I needed to be able to virtualize it, yet still be able to linearly filter it and get the gradient. I'm pretty pleased that I found a fun solutions to both problems. Since I only need a single channel for the density value, I pre-gather a texel's neighbor samples into an RGBA texture while uploading them into the cache. Then in the shader with a single nearest neighbor sample, and some mild decoding I can get a high quality density derivative and a linearly filtered value.

![virtual texturing](/images/DriftGraphicsAbstraction/DensityTiles.png)

A section of terrain vs. it's density tiles. The slight discoloration is actually the encoding of the derivative. It works even better than when I was using page table + screen space derivatives before. \o/

## GL or Vulkan, which is better?

Ultimately I'm pretty happy with my little renderer. It supports GL3 and Vulkan transparently. 

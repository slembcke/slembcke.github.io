---
layout: post
title:  "Project Drift Rendering"
description: "An overview of my custom renderer in Project Drift"
date:   2020-12-13 12:00:00 -0500
categories: Drift
# permalink: 
---

![Project Drift screenshot](/images/DriftRenderer/Key.png)

## Story Time

A number of years ago, I was being funded to work on a continuation of the Cocos2D-iPhone 2.x codebase, a popular open source framework for making iOS games. There was a company called Apportable that made a toolchain for compiling iOS apps on Android. An easy target for Apportable's tech was games that were built on Cocos2D since the required subset of iOS libraries to support it was quite solid already. Riq, the original developer of Cocos had recently moved on to a different fork for C++, and left further development of the Objective-C version to the community. Apportable started funding people full time to keep working on it, and I got involved since my physics engine ([Chipmunk2D](https://github.com/slembcke/Chipmunk2D)) was included with Cocos2D.

At some point, I was put in charge of rendering improvements, and one of my biggest goals was to add some threading support to it. You see Cocos2D was based around scene graph traversal and nodes had "draw" methods that modified OpenGL state directly. Surely a lot of people are cringing at the idea in 2020, but keep in mind Cocos2D was originally targeting the original iPhone with a single core CPU and OpenGL ES 1.x. Anyway, I was sure I could rewrite it to record a command buffer using explicit graphics state objects, and execute it on a dedicated rendering thread. Pretty standard stuff nowadays.

This is an example game we prepared for GDC in 2015. It had fun effects like screen space distortion, normal mapped lighting, and hundreds of physics backed bodies + collisions all running at a smooth 60 fps on an iPad 2. A tablet that was considered min spec in 2015. :)

<iframe width="560" height="315" src="https://www.youtube.com/embed/eJsnCOkG8qs" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## Why Another renderer?

While I did consider using an off the shelf renderer such as [sokol_gfx.h](https://github.com/floooh/sokol) or [bgfx](https://github.com/bkaradzic/bgfx), I ultimately decided to write my own. I figured I didn't need anything fancy, and could keep it relatively simple. Also, I enjoy graphics programming, and knew I could do it.

So what do I need a renderer to do?

* Rendering heavily batched sprites and lighting (streaming buffers + instancing)
* Cram all the sprite atlases into a single binding (texture arrays)
* Deformable terrain (async texture uploads)
* Support multiple APIs without rewriting shaders (SPIR-V, spirv-cross)
* Light-field rendering (multiple render targets)
* Command recording and playback on different threads

This isn't a lot of required features compared to more generic renderers, and I knew I could lift most of the initial code for a GL3 backend from my previous project. From there I just had to make a simple front-end. A few years ago I would have guessed my second API would have been Metal, but Macs feel so much like iOS these days I've migrated to Linux, and so Vulkan became the obvious second choice.

I basically consider the renderer to be complete now, so how big is it? For starters, the front end is ~200 sloc (significant lines of code) of structs and enums plus ~150 sloc to do dispatch, and command recording/playback. The Vulkan renderer is ~1150 sloc, and the GL renderer is ~800 sloc. Though the GL renderer is still missing between 100 - 200 sloc of features. Additionally, if I delete the "unique" parts of each renderer like extension loading for GL, or Vulkan init and memory, where I _could_ have used a library I get about 650 sloc for GL vs 700 sloc for Vulkan. Vulkan is absolutely not as complicated as people make it sound. If you are following a tutorial that makes you write several times as much code as that just to get a triangle on the screen, it really doesn't have to be that way...

Let me know if you are interested in seeing the actual code. A lot of the project's code is pretty purpose built, and I don't really plan to open source it. I wouldn't mind sharing some of the more generic parts like the renderer though.

## Rendering Code Example

Skipping the initialization code for the moment, lets dive straight into a rendering example. Rendering to an offscreen texture, then blitting that to the screen.

```c
// Ask the system to prepare to draw a frame.
// Renderers bundle a per-frame command buffer + vertex/index/uniform buffers.
DriftGfxRenderer* renderer = DriftAppBeginFrame(app, ...);

// As a 2D game, Project Drift doesn't have much use for static buffers.
// Instead, everything is streamed per frame through memory mapped buffers.
// First let's copy the global uniforms to the GPU. (view/proj matrix, etc)
// This is basically a memcpy() directly into a mapped GPU buffer.
glbl_bind = DrifGfxRendererPushUniforms(renderer, &globals, sizeof(globals));
// Instancing is used heavily for sprites, so we need to set up a quad to reuse.
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

// Lastly, we hand the renderer back to the system to execute and present it.
// In my actual game I do this part on a dedicated graphics thread.
DriftAppPresentFrame(app, renderer);
```

Though vastly simpler than GL or Vulkan, it's still admittedly pretty verbose when all you want to do is draw a bunch of quad instances over and over. In my actual code, all of that shared state is tucked behind a single `bindings = draw_quads(pipeline, count)` call. So all I need to do is fill in a couple of the unique slots on the bindings for textures and local uniform values. That makes it pretty easy to buffer and draw lots of things. :)

For example, in my game I have a deferred-like lighting model where I store the 5 fourier series coefficients for a [diffuse lightfield](https://www.shadertoy.com/view/ld2cW1). Kind of like a per-pixel spherical harmonics probe, but simpler because it's in 2D. To render all the lights in the game at once to all 5 texture array slices, it only takes a few lines of code. The mesh instance data and global uniforms are already uploaded at the beginning of the frame so `draw_quads()` can set all of the binding state for me except the instance data.

```c
// Bind all five MRT targets for the lightfield coefficients.
DriftGfxPushBindTargetCommand(renderer, lightfield_target, black_color);

// Copy all of the lighting instance data into VRAM.
light_bind = DriftGfxRendererPushGeometry(renderer, lights, lights_size);

// Draw instanced quads, and set only the unique bindings.
bindings = draw_quads(draw, light_pipeline, light_count);
bindings->instance = light_bind
```

## Initialization

Since it's vaguely trying to be a good modern API citizen, there is a fair amount of init work so that the runtime API can be minimized. To keep the code simple, there are relatively few functions, and like Vulkan you have to pack structs full of options. Unlike Vulkan, I kept my feature set pretty small so there aren't a bajillion options that are all required. ;)

Also since I have both a GL and Vulkan implementation, I have one of those dirty plain C dispatch table thingies as the `driver` object. (Do I hear people cringing again?) Fortunately it's the only place in my game I've needed to do this, and it has a half dozen functions. It's not so bad. ;)

Here's an example of creating a texture.

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
	// I also learned this from @FlohOfWoe. Thanks again! :)
	.bindings[0].texture = texture,
});
```

Here's an example of how I initialize shaders/pipelines.

```c
// Another options struct to fill.
// Probably the most complicated part of my renderer. So no too bad. :)
DriftGfxShaderDesc sprite_shader_desc = {
	// Vertex bindings. (Really just used to pass in the non-instanced quad UVs)
	.vertex[0] = {.type = DRIFT_TYPE_FLOAT32_2, .offset = 0},
	.vertex_stride = sizeof(Vec2),
	
	// Instance attribute bindings.
	.vertex[1] = {.instanced = true, .type = DRIFT_TYPE_FLOAT32_4, .offset = offsetof(Sprite, matrix) + 0x00},
	.vertex[2] = {.instanced = true, .type = DRIFT_TYPE_FLOAT32_2, .offset = offsetof(Sprite, matrix) + 0x10},
	.vertex[3] = {.instanced = true, .type = DRIFT_TYPE_UNORM8_4, .offset = offsetof(Sprite, color)},
	.vertex[4] = {.instanced = true, .type = DRIFT_TYPE_U8_4, .offset = offsetof(Sprite, frame) + 0x0},
	.vertex[5] = {.instanced = true, .type = DRIFT_TYPE_U8_4, .offset = offsetof(Sprite, frame) + 0x4},
	.instance_stride = sizeof(Sprite),
	
	// GL3 doesn't have layout qualifiers for bindings.
	// I could probably get these from SPIR-V reflection, but meh.
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

That's pretty much it for shader setup. It's definitely the most tedious part of shader programming. I tried to keep it as simple as possible, but without taking away the power to pack my own attribute data. So far it's worked great.

## Shaders: SPIR-V to the rescue!

I'm not a huge fan of GLSL. Almost every shader I've ever written has been a matched vertex/fragment pair, and splitting them into separate files doesn't really make sense in the general case. Matching the in/out parameters between them by hand is needlessly tedious. I also have a fair amount of shared code to make my light-field rendering work, and GLSL really doesn't have a way to link multiple files or do includes. Sure there are hacks and workarounds, but why bother?

HLSL kinda mostly solves all these issues. It can do includes, and you can stick your shaders together in the same file and share definitions. I like it well enough, and SPIR-V tools actually made the whole process really easy. I can get Vulkan compatible SPIR-V straight out of `glslangValidator` when compiling HLSL files. To get GLSL from the SPIR-V for GL3 you just run in through `spirv-cross`. Done! There were only a couple of gotchas I ran into.

### Layout Oualifiers

The first issue was how to get HLSL to bind vertex attributes to GL/Vulkan locations. I had to dig a bit to figure this one out, but `glslangValidator` supports a few custom attributes you can put on your variables, and one of them maps directly to GLSL's location qualifier. Easy peasy! Stick it behind a macro and you are good to compile it for DirectX too.

```hlsl
struct VertInput {
	[[vk::location(0)]] float2 position;
	...
}
```

### Row Major or Column Major?

Next up was how to get my matrices to work. I found a satisfactory way to pack my 2x3 affine transforms and pass them to HLSL using the standard `row_major` qualifier. I suppose this will be different for a 3D project, but there are options.

```hlsl
cbuffer DriftGlobals : register(b0) {
	row_major float2x4 DRIFT_MATRIX_V;
	...
}
```

### Binding Locations

Did you spot the `register(b0)` qualifier above? You can use the standard HLSL syntax for that, but you _must_ use unique indexes even if they are different types however (buffer, sampler, texture, etc). I found out the hard way that from Vulkan all the register types are mapped into the same indexes. It was pretty confusing before I had Vulkan Validations working. O_o There is probably a option in the SPIR-V tools to handle this more cleanly, but I was happy enough to make some macros.

### Texture/Sampler Names

Other than the register index issue above, binding samplers and textures in Vulkan is straightforward. On the GL3 side it's sort of a clusterflush though. Since GL doesn't support separate textures/samplers, `spirv-cross` "helpfully" clumps them together for you. To be fair, I don't know what it's supposed to do, but I wish the format was a little more controllable. I was pretty adamant about finally being able to use using proper samplers, so I dealt with it.

For example: `SPIRV_Cross_CombinedDriftAtlasDriftNearest`

You need to chop off the 'SPIRV_Cross_Combined', then know to separate 'DriftAtlas' from 'DriftNearest'. Not so bad, just annoying.

## Texture Streaming

Since one of the main features I wanted in the game was to have large scale deformable terrain, I implemented asynchronous texture streaming. This lets me quickly re-upload dirty tiles, and stream them in as needed into a relatively small cache. I kept the implementation simple by limiting it to replacing whole texture array layers. Other than adding a ring buffer for the queue, it turned out to be a pretty trivial change to the regular synchronous texture loading I had for Vulkan, so I just replaced it. Internally my implementation is just a fixed size buffer and a set of job fences.

While not really a renderer feature per-se, I use the texture streaming for a simple virtual texturing scheme in the game for the deformable terrain density texture. Since it's a pixel art game, nearly everything is nearest sampled... except for the one texture I want to virtualize. On top of that, it needs to have high quality derivatives for the lighting. Drat! Fortunately, I found a fun solutions to both problems that I'm quite pleased with. Since I only need a single channel for the density value, I pre-gather a texel's neighbor samples into an RGBA texture while uploading tiles into the cache. Then in the shader with a single nearest neighbor sample, and some mild decoding I can get a high quality density derivative and a linearly filtered value.

![virtual texturing](/images/DriftRenderer/DensityTiles.png)

A section of terrain vs. it's density tiles. The slight discoloration is actually the encoding of the derivative. It works even better than when I was using a page table and screen space derivatives before. \o/

## Threading

Last, but not least. I wanted to have good support for threading in the renderer. The threaded renderer I made for Cocos worked so well, I've never really wanted to take a step back from it. Worse, I decided to take a step forward and make my own [fiber based job system](/drift/2020/08/28/DriftJobs.html) for Project Drift. So far I've been having a blast with it, and it works extremely well! While I'm sure I could have gotten away with acceptable performance with just a single thread, I also wanted this project to be a learning experience where I get to try new things and try to stay current. I had considered implementing the ability to have multiple command recording threads... but nah. My renderer is already so heavily batch oriented it just doesn't make any sense.

## Thoughts

Overall I'm quite happy with what I came up with. It's relatively simple, but capable of everything I need. Between GL3 and Vulkan, it runs on a pretty wide variety of hardware. Sure, it's a couple thousand lines of code I could have avoided by using somebody library, but it's also the sort of code I enjoy writing. I consider it time well spent. :)

As far as Vulkan being too complicated? Well that is itself... complicated. Yes, there is more "stuff" you have to do, but there are also libraries that cover much of it: Instance + device initialization, swapchain creation + syncronization, memory management, pipeline construction, descriptor updates, etc. On the other hand, Vulkan validations are fantastic. Maybe D3D and Metal validations have caught up since I last tried them, but it's certainly light years ahead of GL's error handling. Overall, I liked working with Vulkan enough that it's become the default renderer I run, and the only one I bothered to implement hot-reloading for.

In my opinion, somebody just needs to popularize a thin wrapper for Vulkan. Something that provides:
* Very basic initialization and device selection
* A ready-to-use swapchain implementation
* Very basic memory management
* Simplified pipeline construction that provides default values
* Simplified texture and render texture creation
* A simple, fixed descriptor binding model

If it's strictly trying to provide a subset of the Vulkan API, and not just a different abstraction of the existing one, then it would be suspiciously similar to Metal. It would also allow the codebase to be kept small, maybe 1-2k sloc, and that's good for hackability. When it doesn't do what you want, it's simple enough to be changed! If such a library had existed for me to use, my Vulkan renderer would be considerably shorter than the GL renderer.

As an added bonus, the new Vulkan driver for the Raspberry Pi 4 has been working fantastically. With only a few tweaks, I've been able to get my game up and running there, and the performance is great! In my tests, though it's quite fillrate bound, it can handle rendering as much stuff as I can push with `memcpy()` in a single frame. It even handles my crazy light-field rendering scheme with ease. :D

---
layout: post
title: "Simple 2D Lighting with Hard Shadows"
description: ""
date: 2020-01-01 12:00:00 -0500
#categories: jekyll update
permalink: 
---

## 2D lighting made easy.

Adding dynamic lighting to a 2D game is a relatively easy way to add a lot of depth and atmosphere to your game. By the end of this article, you'll have some ideas for implementing fast and simple lighting for 2D games. 

TODO mention overview article

(images of some examples)

# Interactive Example

(TODO)

## Basic Screen Space Lightmaps

For 3D games, lightmaps are big texture atlasses that record how much light there is on various surfaces. Generating and using them is a _huge_ topic, but for 2D games we can do something vastly simpler. The simplest way I know of is to simply use an additive blending mode to draw some fuzzy blob sprites into an offscreen buffer using the same camera coordinates as your main scene. Then you can draw the lightmap over the top using a multiply blending mode to tint the scene by the light colors. Though it's very simplistic, it's an easy and reasonable start of a lighting system.

![lightmap a](/images/lighting-2d/lightmap-2d-a.png)
![lightmap b](/images/lighting-2d/lightmap-2d-b.png)
![lightmap c](/images/lighting-2d/lightmap-2d-c.png)

If you want more control over how the lighting is applied, you can either draw in layers or use a custom sprite shader. Using layers is easier, but not as flexible. For example, you can draw your lit background layers, multiply the lightmap over it, then draw the foreground layer over the top as unlit. Using a custom sprite shader you would use the sprites screen coordinate to read from the lightmap and apply the tinting in the fragment shader. This lets you selectively choose which sprites are lit without relying on draw ordering or layers. It also lets you layer your lightmaps and blend between more than one of them.

## Simple Hard Shadow Geometry

Now we get to the fun part, shadows! It might be just me, but I find shadows in 2D games to be very satisfying to watch. It's the neat effects you get as shadows spill across the floor of a room and none of the boring subtle parts that my brain is good at ignoring maybe. :) The easiest and most efficient way to add shadows that I know of is to outline all of your objects in line segments. Though it can be a tedious extra step, it's usually not so bad. If you are using a physics engine, you can probably just reuse your collision data for example. The benefit is that line segments are really easy to work with for casting shadows.

I've shipped a few games using this simple hard shadow technique. It's simple enough you don't even need shaders to make it work! Here is an example running on an old iPhone:

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/EhSq8jqxTx4" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

# Shadow Masks

The basic idea is that before rendering each light, you use the shadow geometry to draw a mask that blocks the light from drawing where it's not supposed to go. The easiest way to do this in most environments is to draw the mask into the lightmap's alpha channel. First clear the alpha to white, draw the mask as black, and change the additive blend mode to also multiply by the alpha.

(Needs an image to demonstrate)

Generally speaking there isn't a "clear the alpha" function in graphics APIs. You'll have to draw a quad over the whole screen with a blend mode or write mask set so that it only affects the alpha. There are some good tips to optimize this pass or entirely avoid it at the end of the article.

# Shadow Projection Made Easy

![shadow projection](/images/lighting-2d/shadow-projection.svg)

Something like this in code:
```
quad[0] = segment[0]
quad[1] = segment[1]
quad[2] = segment[0] + 100*(segment[0] - light_position)
quad[3] = segment[1] + 100*(segment[1] - light_position)
```

This will project the shadows a finite distance from the line segment endpoints, in this case 100x further away. While this is easy to understand, if the shadow moves very close to the light, then the other edge of the shadow can become visible onscreen. You could just multiply by a larger number... but wouldn't it be better if you could multiply by infinity here? Well it turns out you can, and it's actually simpler!

# Infinite Homogenous Coordinates

One of the fundamental concepts computer graphics is built on is homogenous coordinates. This is a very deep subject, so I'll keep this short. Homogenous coordinates are your familiar cartesian coordinates, but they add an additional "w" value. So if you have a homogenous coordinate `(x, y, z, w)` you can convert it to "normal" coordinates by dividing the _x_, _y_, and _z_ parts by _w_. This might seem weird and arbitrary, but it allows you to represent translation and perspective with matrix transforms.

One neat property of homogenous coordinates is what happens when _w_ is zero. Say you have the coordinate `(x, y, z, w)`. If you convert that to regular coordinates you get `(x/w, y/w, z/w)`. So normally when specifying regular coordinates, you'd use `w = 1`. If you made _w_ smaller than 1, then the converted coordinate would get bigger, but still pointing in the same direction. The smaller you make _w_ the further away the coordinate gets. It might seem weird that _w_ can be zero since that's division by zero, but that's only when converting to regular coordinates. This math works out just fine in homogenous coordinates, and it represents a point at infinity in the direction of the _x_, _y_, _z_ part. This is exactly what we wanted above, a way to project the other side of the shadow to infinity.

Rewriting tho code above to use infinite projection would look something like the following. Note that the `quad[]` vertexes are now being stored as 4 component floats.
```
quad[0] = float4(segment[0], 0, 1)
quad[1] = float4(segment[1], 0, 1)
quad[2] = float4(segment[0] - light_position, 0, 0)
quad[3] = float4(segment[1] - light_position, 0, 0)
```

This does require a graphics API that allows you to use 4 component vectors. Otherwise you can always fall back to the finite projection code above.

# GPU Accelerated Shadows

The biggest CPU cost you'll run into when rendering shadows is setting up the geometry for all the shadow quads. If you have 1000 shadow segments and 10 lights, you'll need to calculate and submit 10,000 quads. While that's not a lot, you can see how quickly it can add up. Ideally what you want to do is to just copy the shadow data once to the GPU one and reuse it for all the lights. Though you don't need a shader to do this, it does make it easier to see how it works.

```
// On the CPU, pack the quad data similarly to before, but as float3.
// The z-value defines if a vertex is on the near or far side of the shadow.
quad[0] = float3(segment[0], 0)
quad[1] = float3(segment[1], 0)
quad[2] = float3(segment[0], 1)
quad[3] = float3(segment[1], 1)

// In the shader, use the z-value to output a homogenous coordinate.
output_position = float4(vertex.xy - vertex.z*light_position, 0, 1 - vertex.z)
```

Now to draw a light, all you need to do is update the `light_position` variable and draw the shadow geometry. Given how good even the slowest GPUs are in 2021, you don't need to put a lot of effort into culling. It's probably much faster to draw a few thousand extra polygons than it is to try and cull them.

To further simplify the CPU's work, you can use instancing to render the shadow quads. Pass the segment endpoints as instance data, and use it to move the vertexes of a template quad around. Though instancing quads is generally not optimal for a GPU, it tends to be way faster than doing it on the CPU, at least for dynamic data anyway.

As a final thought, although platforms that don't support shaders are vanishingly rare now, it's entirely possible to do the same infinite projection with just a special perspective matrix. This is actually how I first figured out how to do the hard shadowing effect, and how I made it run well before shaders were widespread.

## Further Optimizations

At this point you have a very simple, but effective system to draw 2D shadows!

Usually, the largest performance cost of this algorithm is the number of pixels it has to draw. You can easily end up with many fullscreen passes to draw a single scene:
1. Fullscreen alpha clearing pass.
1. Draw a shadow mask (Often with a _lot_ of overdraw)
1. Draw a light (large lights can easily cover the whole screen)
1. Repeat 1-3 for each light.
1. Draw a fullscreen pass to apply the lightmap.

Even though it's "just 2D", drawing too many pixels like this can easily tank your performance. Especially on integrated or mobile GPUs that don't have a lot of raw memory bandwidth available.

# Skip Shadows

The easiest optimization is to simply skip steps 1 & 2 for lights that don't need to cast shadows. This is especially true for small lights where the effect of the shadows can be quite subtle anyway.

# Backface culling

Backface culling in 3D graphics APIs allows you to skip drawing pixels for the back sides objects. To detect which side is which, yo need to "wind" all the vertices in your triangle the same direction, clockwise vs counterclockwise. You can use this almost exactly the same way for shadow geometry. If you wind all of your objects the same way, you can turn on backface culling and avoid drawing the shadow coming off the back of an object since it will be covered by the shadow from the front side anyway.

(TODO example image)

This can also be useful to draw your shadows inside out and only cast from the back. I've used this in the past before I could use shaders and layering to control how objects cast shadows on themselves.

# Subsampling

Another really simple optimization is to simply lower the resolution of your lightmap. In my experience, drawing shadows at half resolution is pretty subtle, but requires drawing a quarter as many pixels. That's huge!

This is also a good use case for soft shadows too. Though they have a slightly higher rendering cost, I often find I can get away with rendering soft shadows at a quarter resolution. That's an order of magnitude reduction in lighting costs!

(TODO example image)

# Scissor Testing

Scissor testing allows you to limit drawing to a certain area of the screen. This is useful for small lights that only cover a small area. Set the scissor rectangle to just allow drawing to the pixels where the light will shine. Then the alpha clearing and shadow mask passes won't draw pixels that won't get used. This can have a _huge_ effect on performance with many small lights.

(TODO example image)

# Clear alpha while accumulating

As I mentioned earlier, it's also possible to get rid of that pesky alpha clearing pass. If you have the option to use a blending mode that handles color and alpha separately, you can combine the additive pass for the light with the alpha clearing pass. The trick is that you need to add padding around your light's sprite so that it will always cover the whole screen (or scissor rectangle). Texture clamping is your friend here.

# A Simple Culling Strategy

For simple scenes, you can get away without having any sort of culling, but as your levels get larger you may need to consider it at some point. The obvious place to start is to mae a list of which lights are visible onscreen. A bounds check is significantly cheaper than the _several_ draw calls it takes to render a single light. Also, don't go crazy with spatial indexes here. For a list of hundreds of lights that will be updated and queried once per frame... it's hard to beat the cache friendly raw performance of a boring old packed array of bounds + linear search.

If your shadow geometry is all static, you'll almost definitely want to load it onto the GPU once and leave it there. Otherwise I would try and stick to batching all of the shadow geometry together each frame for simplicity. If you really need to cull it, try to do it coarsely. Break your static geometry into large chunks that can be quickly copied. To determine which casters are visible, take the union of the screen rect and the centers of all the visible lights. This rectangle will be a reasonable lower bound for anything that can cast shadows onto the screen.

(TODO example image)

## Conclusion

That is pretty much everything I know about implementing hard shadows for 2D games. Hopefully it gives you some ideas about how you want to implement them in your own game. In the next article I'll show how to take this idea and extend it to produce fairly accurate soft shadows. Happy illuminating. :)

<canvas id="glcanvas" width="640" height="480"></canvas>

<script>
	// Quick vertex shader to draw a light with.
	// Just use a sprite in a real project, it makes the shape/gradient more flexible.
	const LIGHT_VSHADER = (`
		attribute vec2 a_vertex;
		attribute vec2 a_uv;
		
		varying lowp vec2 v_uv;
		
		uniform mat4 u_matrix;

		void main(){
			gl_Position = u_matrix*vec4(a_vertex, 0, 1);
			v_uv = a_uv;
			
			// I'm too lazy to use a projection matrix here...
			gl_Position.x *= 0.75;
		}
	`);

	// Quick fragment shader to draw a light with.
	// Just use a sprite in a real project, it makes the shape/gradient more flexible.
	const LIGHT_FSHADER = (`
		varying lowp vec2 v_uv;
		
		uniform lowp vec3 u_color;
		
		void main(){
			// A nice radial gradient with quadratic falloff.
			lowp float brightness = max(0.0, 1.0 - pow(dot(v_uv, v_uv), 0.25));
			gl_FragColor = vec4(brightness*u_color, 1.0);
		}
	`);

	// Quick vertex buffer to draw a light with.
	// Just use a sprite in a real project, it makes the shape/gradient more flexible.
	const LIGHT_SPRITE_VERTS = new Float32Array([
		 10,  10,  10,  10,
		-10,  10, -10,  10,
		 10, -10,  10, -10,
		-10, -10, -10, -10,
	]);
	
	// The shadow projection magic happens here in the vertex shader.
	const SHADOW_VSHADER = (`
		attribute vec3 a_vertex;
		
		uniform mat4 u_matrix;
		uniform vec2 u_light_position;

		void main(){
			// Transform the position.
			// If you are batching the shadow data, you can pre-apply the transform instead.
			highp vec2 position = (u_matrix*vec4(a_vertex.xy, 0.0, 1.0)).xy;
			
			// When a_vertex.z is 0, the vertex is on the near side of the shadow and is output as is.
			// When a_vertex.z is 1, the vertex is on the far side of the shadow as is projected to inifity.
			gl_Position = vec4(position - a_vertex.z*u_light_position, 0, 1.0 - a_vertex.z);
			
			// I'm too lazy to use a projection matrix here...
			gl_Position.x *= 0.75;
		}
	`);

	// The fragment shader just has to output black. Easy.
	const SHADOW_FSHADER = `void main(){gl_FragColor = vec4(0.0);}`;

	// This is a polyline outline of a rectangle.
	// It will be transformed into shadow vertex data in main().
	const SHADOW_POLYLINE = [
		{x: -0.2, y: -0.1},
		{x:  0.2, y: -0.1},
		{x:  0.2, y:  0.1},
		{x: -0.2, y:  0.1},
		{x: -0.2, y: -0.1},
	];

	function main() {
		const canvas = document.querySelector('#glcanvas');
		const gl = canvas.getContext('webgl');

		if(!gl){
			alert('Unable to initialize WebGL. Your browser or machine may not support it.');
			return;
		}
		
		// Convert the shadow polyline into a vertex buffer of shadow geometry.
		// Each vertex is output twice, one needs a z-value of 0.0, and the other 1.0.
		const shadow_verts = new Float32Array(6*SHADOW_POLYLINE.length);
		for(var i in SHADOW_POLYLINE){
			const v = SHADOW_POLYLINE[i];
			const idx = 6*i;
			
			// Output the first vertex. (x, y, z)
			shadow_verts[idx + 0] = v.x;
			shadow_verts[idx + 1] = v.y;
			shadow_verts[idx + 2] = 0.0;
			
			// Output the second vertex. (x, y, z)
			shadow_verts[idx + 3] = v.x;
			shadow_verts[idx + 4] = v.y;
			shadow_verts[idx + 5] = 1.0;
		}
		
		// This blend mode applies the shadow to the light, accumulates it, and resets the alpha.
		// The source color is multiplied by the destination alpha (where the shadow mask has been drawn).
		// The alpha src alpha replaces the destination alpha.
		// For the accumulate/clear trick to work your light must be opaque,
		// and cover the the whole drawable area (framebuffer or scissor rectangle)
		const blend_light = {
			equation: {color: gl.FUNC_ADD, alpha: gl.FUNC_ADD},
			function: {color_src:gl.DST_ALPHA, color_dst:gl.ONE, alpha_src:gl.ONE, alpha_dst:gl.ZERO},
		};
		
		// Shadows should only be drawn into the alpha channel and should leave color untouched.
		// You could also do this with a write mask if that's supported.
		const blend_shadow = {
			equation: {color: gl.FUNC_ADD, alpha: gl.FUNC_ADD},
			function: {color_src:gl.ZERO, color_dst:gl.ONE, alpha_src:gl.ZERO, alpha_dst:gl.ZERO},
		};
		
		// Bundle up all of rendering data we need...
		const ctx = {
			gl: gl,
			light_material: {
				shader: create_shader(gl, LIGHT_VSHADER, LIGHT_FSHADER),
				vbuffer: create_vbuffer(gl, LIGHT_SPRITE_VERTS),
				blend: blend_light,
				attrib_stride: 16, attribs: [
					{name: "a_vertex", size: 2, offset: 0},
					{name: "a_uv", size: 2, offset: 8},
				],
			},
			shadow_material: {
				shader: create_shader(gl, SHADOW_VSHADER, SHADOW_FSHADER),
				vbuffer: create_vbuffer(gl, shadow_verts),
				blend: blend_shadow,
				attrib_stride: 12, attribs: [
					{name: "a_vertex", size: 3, offset: 0},
				],
			},
		};
		
		// Start the drawing loop.
		function render_loop(time){
			draw(ctx, time*1e-3);
			requestAnimationFrame(render_loop);
		}
		
		requestAnimationFrame(render_loop);
	}

	function draw(ctx, time){
		const gl = ctx.gl;
		
		// Make sure to clear the alpha to 1.0 otherwise your first light won't show up!
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		
		// A list of the visible lights we want to draw.
		const lights = [
			{x:-1, y:-1, size: 2, color: [1, 1, 0]},
			{x: 1, y:-1, size: 2, color: [0, 1, 1]},
		];
		
		// Animate the transform of the box that casts the shadow.
		const rectangle_transform = mat4_trs(0.3*Math.cos(time), 0.3*Math.sin(time), time, 1);
		
		for(var i in lights){
			const light = lights[i];
			
			// Draw the shadow mask into destination alpha.
			// You can skip the transform part if you batch the geometry or something.
			// However, the shadow shader does need the light's position to know where to project from.
			bind_material(gl, ctx.shadow_material, [
				{name: "u_matrix", type: UNIFORM.mat4, value: rectangle_transform},
				{name: "u_light_position", type: UNIFORM.vec2, value: [light.x, light.y]}
			]);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 2*SHADOW_POLYLINE.length);

			// This is my quick and dirty way of drawing a sprite for the lights.
			// Other than the blending mode, the implementation here is unimportant.
			bind_material(gl, ctx.light_material, [
				{name: "u_color", type: UNIFORM.vec3, value: light.color},
				{name: "u_matrix", type: UNIFORM.mat4, value: mat4_trs(light.x, light.y, 0, light.size)},
			]);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
		
		// At this point the lightmap is complete.
		// To actually use it in a game, you'll need to render it offscreen or into a texture.
		// Then either multiply it over the scene, or read it in your sprite shaders and multiply there.
	}

	// The rest of the code is just boring WebGL stuff... It's simple, but not very efficient.
	// No attempt is made to avoid cache anything or avoid redundant state changes.
	// Also this is the first JS I've written in like 10 years, feel free to judge it. :p
	function create_shader(gl, LIGHT_VSHADER, LIGHT_FSHADER) {
		function compile(gl, type, source) {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);

			if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
				alert('Failed to compile shader: ' + gl.getShaderInfoLog(shader));
				gl.deleteShader(shader);
				return null;
			} else {
				return shader;
			}
		}
		
		const vshader = compile(gl, gl.VERTEX_SHADER, LIGHT_VSHADER);
		const fshader = compile(gl, gl.FRAGMENT_SHADER, LIGHT_FSHADER);

		const shader = gl.createProgram();
		gl.attachShader(shader, vshader);
		gl.attachShader(shader, fshader);
		gl.linkProgram(shader);

		if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) {
			alert('Unable to initialize the shader shader: ' + gl.getProgramInfoLog(shader));
			gl.deleteShader(vshader);
			gl.deleteShader(fshader);
			gl.deleteProgram(shader);
			return null;
		} else {
			return shader;
		}
	}

	function create_vbuffer(gl, vertexes){
		const vbuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vbuffer);
		gl.bufferData(gl.ARRAY_BUFFER, vertexes, gl.STATIC_DRAW);
		
		return vbuffer;
	}

	function mat4_trs(x, y, rotate, scale){
		const c = scale*Math.cos(rotate);
		const s = scale*Math.sin(rotate);
		return [
			c, -s, 0, 0,
			s,  c, 0, 0,
			0,  0, 1, 0,
			x,  y, 0, 1,
		];
	}

	const UNIFORM = {
		vec2: function(gl, loc, value){gl.uniform2fv(loc, value);},
		vec3: function(gl, loc, value){gl.uniform3fv(loc, value);},
		mat4: function(gl, loc, value){gl.uniformMatrix4fv(loc, false, value);},
	};

	function bind_material(gl, material, uniforms){
		if(material.blend){
			gl.enable(gl.BLEND);
			const blend = material.blend;
			gl.blendEquationSeparate(blend.equation.color, blend.equation.alpha);
			const func = blend.function;
			gl.blendFuncSeparate(func.color_src, func.color_dst, func.alpha_src, func.alpha_dst);
		} else {
			gl.disable(gl.BLEND);
		}
		
		gl.bindBuffer(gl.ARRAY_BUFFER, material.vbuffer);
		for(var i in material.attribs){
			const attrib = material.attribs[i];
			const loc = gl.getAttribLocation(material.shader, attrib.name);
			gl.vertexAttribPointer(loc, attrib.size, gl.FLOAT, false, material.attrib_stride, attrib.offset);
			gl.enableVertexAttribArray(loc);
		}
		
		gl.useProgram(material.shader);
		for(var i in uniforms){
			const uniform = uniforms[i];
			uniform.type(gl, gl.getUniformLocation(material.shader, uniform.name), uniform.value);
		}
	}

	main();
</script>

---
layout: post
title: "Wave Simulation"
description: "Wave Simulation with FFTs."
date: 2022-12-20
permalink: WaveSim
---

<script src="js/lifft.js" /></script>

People _love_ water in video games. I can't count the number of times I've heard people talking about how realistic the water is in the latest and greatest game. I make no claims to be immune to it either as I've stopped to appreciate it's beauty in many a game. :)

![Water in Half Life 2](images/waves/hl2-water.jpg)
![Water in Subnautica](images/waves/subnautica-water.jpg)

Rendering and animating water are both pretty big topics, so this article is going to detail a particular algorithm for procedurally animating interactive water waves. Something like this!

<canvas id="wavies" style="border:solid 1px #0002;"></canvas>

<script>
(function(){
	const canvas = document.getElementById("wavies")
	canvas.width = canvas.parentElement.clientWidth
	canvas.height = canvas.width/4
	const ctx = canvas.getContext("2d")
	
	let mfocus = false
	let mpos = {x: 0, y: 0}
	let mprev = {x: 0, y: 0}
	const mradius = 20
	
	canvas.onmouseenter = function(e){
		mfocus = true
		mprev = mpos = {x: e.offsetX, y: e.offsetY}
	}
	canvas.onmouseleave = (e => mfocus = false)
	canvas.onmousemove = (e => mpos = {x: e.offsetX, y: e.offsetY})
	
	// Setup the waves with some initial frequencies in it.
	const spectra = lifft_complex_arr(64)
	const starting_spectra = [
		0.00, 0.42, 2.68, 5.23, 7.21, 1.56, 7.05, 3.50,
		2.79, 4.21, 3.33, 2.68, 1.98, 1.47, 1.11, 0.80,
	]
	for(let i = 0; i < starting_spectra.length; i++){
		const phase = 2*Math.PI*Math.random()
		spectra.re[i] = starting_spectra[i]*Math.cos(phase)
		spectra.im[i] = starting_spectra[i]*Math.sin(phase)
	}
	let waves = lifft_inverse_complex(spectra)
	
	// Interact with the waves using the mouse.
	function interact_waves(mvel, waves){
		// Calculate mouse position in wave coordinates
		const scale = waves.n/canvas.width
		const mx = mpos.x*scale
		const my = canvas.height/2 - mpos.y - waves.re[Math.floor(mx)]/scale
		
		// The magnitude of the interaction. Linear fallof above the waterline, and exponential below.
		const mag = Math.min(Math.max(0, 1 - my/mradius), Math.exp(0.5*my/mradius))
		// Calculate the width of the interaction, widening it the deeper it goes.
		const width = Math.max(-1.5*my/mradius, 2)
		
		// Apply the interaction to the wave near the mouse.
		const x0 = Math.max(0, Math.floor(mx - width))
		const x1 = Math.min(Math.ceil(mx + width), waves.n - 1)
		for(let i = x0; i < x1; i++){
			// Use a gaussian curve as a strength to apply the interaction with.
			const dx = mx - i - 0.5, dx_w = dx/width
			const gauss = -width*(1 + Math.exp(dx_w*dx_w))
			
			// Interpolate the wave velocity towards the mouse velocity.
			const damp = 1 - Math.exp(0.3*mag/gauss)
			waves.im[i] -= ((dx*mvel.x + mvel.y)/waves.n + waves.im[i])*damp
		}
	}
	
	// Update the waves
	function update_waves(waves, damping, dt){
		const n = waves.n
		const spectra_x = lifft_complex_arr(n, waves.type)
		const spectra_y = lifft_forward_complex(waves)
		// The first value is the water height, force it to stay at 0.
		spectra_y.re[0] = spectra_y.im[0] = 0
		
		// Now iterate over the +/- frequency pairs and update their phases and amplitudes.
		for(let i = 0; i <= n/2; i++){
			const phase = -dt*Math.sqrt(i)*Math.PI, mag = Math.exp(-dt*damping*i)
			const w = lifft_complex(mag*Math.cos(phase), mag*Math.sin(phase));
			
			p = lifft_cmul(w, lifft_complex(spectra_y.re[i], spectra_y.im[i]))
			spectra_x.re[i] = +p.im, spectra_x.im[i] = -p.re
			spectra_y.re[i] = +p.re, spectra_y.im[i] = +p.im
			
			const j = -i & (n - 1)
			q = lifft_cmul(w, lifft_complex(spectra_y.re[j], spectra_y.im[j]))
			spectra_x.re[j] = -q.im, spectra_x.im[j] = +q.re
			spectra_y.re[j] = +q.re, spectra_y.im[j] = +q.im
		}
		
		return [lifft_inverse_complex(spectra_x), lifft_inverse_complex(spectra_y)]
	}
	
	let prev_ms = 0
	function animate(ms){
		const dt = 1e-3*(ms - prev_ms) + Number.MIN_VALUE
		const mvel = {x:(mpos.x - mprev.x)/dt, y:(mpos.y - mprev.y)/dt};
		mprev = mpos; prev_ms = ms
		
		// Apply mouse interaction if necessary
		if(mfocus && 0 < mpos.x && mpos.x < canvas.width) interact_waves(mvel, waves)
		
		// Update the waves.
		const [wave_x, wave_y] = update_waves(waves, 2e-2, dt)
		waves = wave_y
		
		ctx.save()
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		
		const scale = canvas.width/(waves.n - 1)
		ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		ctx.strokeStyle = "#0CF"
		ctx.lineWidth = 3/scale
		ctx.beginPath()
		for(let i = 0; i < waves.n; i++) ctx.lineTo(i - 0.25*wave_x.re[i], wave_y.re[i])
		ctx.stroke()

		// Draw mouse
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.fillStyle = "#FF0"
		ctx.strokeStyle = "#F80"
		ctx.lineWidth = 2
		ctx.beginPath()
		ctx.arc(mpos.x, mpos.y, 20, 0, 2*Math.PI)
		ctx.fill()
		ctx.stroke()
		
		if(!mfocus){
			ctx.setTransform(3, 0, 0, 3, canvas.width/2, canvas.height/2)
			ctx.fillStyle = "#0008"
			ctx.textAlign = "center"
			ctx.fillText("Use Mouse to Interact", 0, 0)
		}
		
		ctx.restore()
		window.requestAnimationFrame(animate)
	}
	
	animate(0)
})()
</script>

The algorithm itself extends to 3D easily enough, though I'll be doing it in 2D so it's easier to make visualizations.

## Lots of Algorithms

There's actually quite a lot of algorithms for simulating water, and I wouldn't be doing a very good blog job if I only told you about this FFT based one!

# Scrolling Textures

Sometimes the best code is the code you didn't have to write, and so why not skip the simulation if you don't need it? Plenty of games have water that looks just great, but is just simple scrolling textures.

# Simple Filtering

Filtering is probably the easiest to implemnt. You treat the water as a uniform grid where each cell stores the vertical position and velocity. Then you do something like this:

```python
cells = [.. an array of water cells]
tmp = [... a temporary array of water cells]

foreach i in cells.count
	# Make a weighted average with the neighboring cells to propagate the waves.
	pos = (0.5*cells[i - 1].pos + cells[i].pos + 0.5*cells[i + 1].pos)/2
	vel = (0.5*cells[i - 1].vel + cells[i].vel + 0.5*cells[i + 1].vel)/2
	
	# Feed the position and velocity into one another to make the water bob.
	tmp[i].pos = pos + 0.01*vel
	tmp[i].vel = vel - 0.01*pos

cells = tmp
```

That's pretty much it! There's a lot of room for variation too. For instance, you could store the current and previous position and use vertlet integration instead. You can also use a more complicated low pass filter than the simple weighted average to change the shapes of the waves, or how quickly they propagate. To interact with the water, you can kind of just modify the position or velocity directly and let things happen

Other than it's simplicity, this method is also extremely fast. There were a number of games for the PS2/GC/Xbox era that looked like they probably used this method for interactive water waves. Implementing the effect in 3D scales very well too. You just need to sample more neighboring values or implement it as a separable filter.

The biggest downside with this method is that it doesn't really look all that realistic. Unlike light waves or soundwaves, waves on the surface of water don't all move at the same speed. Waves with longer wavelengths move faster. That's what causes water to have that pulsing look to it as the longer waves overtake shorter ones and cause them to crest as they add together.

# Fourier Methods

That's where the fourier methods step in, and what I'll be discussing in this article. Similar to the filtering method, you treat the water as a grid. Using an fast fourier transform you can convert the waves to a spectrum, move the different wavelength's phases forward by their corresponding speed, and then convert back to waves. If phases and fourier transforms sound intimidating, I hope to change your mind!

This method will produce nicer looking waves than simple filtering, and is very flexible. You can also use it to animate purely procedural waves pretty easily. The downside is of course that FFTs are more expensive than simple filters that only need to sample a couple of neighbors.

[Jump Trajectory](https://www.youtube.com/watch?v=kGEqaX4Y4bQ) has a nice overview video about how they implemented this technique in Unity. It's an excellent video, but a bit light on details perhaps.

# Computational Fluid Dynamics

Lastly, if you want the ultimate in wavey realism then computational fluid dynamics is for you. Instead of just simulating the surface of the water, you simulate it all. This will simulate realistic splashes, cresting waves, and more. While I've never implemented CFD myself, it really doesn't look all that hard.  Ten Minute Physics recently posted a video on [implementing the FLIP algorithm](https://youtu.be/XmzBREkK8kY) in 2D. It looks rather fun! There's also a neat library for 2D fluid simulation using particles based on Box2D called [Liquid Fun](https://google.github.io/liquidfun/).

## A Quick FFT Primer

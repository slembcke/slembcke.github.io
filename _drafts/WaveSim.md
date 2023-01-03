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
{: style="text-align: center"}

Water in Half Life 2 and Subnautica.
{: style="text-align: center"}

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
		
		ctx.beginPath()
		ctx.lineTo(0, -100)
		for(let i = 0; i < waves.n; i++){
			ctx.lineTo(i - 0.25*wave_x.re[i], wave_y.re[i])
		}
		ctx.lineTo(canvas.width, -100)
		ctx.fillStyle = "#0CF"
		ctx.fill()
		// ctx.strokeStyle = "#0004"
		// ctx.lineWidth = 3/scale
		// ctx.stroke()

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
			ctx.setTransform(3, 0, 0, 3, canvas.width/2, canvas.height/3)
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

The algorithm itself extends to 3D easily enough, though I'll be doing it in 2D so it's easier to make quick visualizations.

## Lots of Water Algorithms

There's actually quite a lot of algorithms for simulating water. One of the simplest is to treat the water surface like a grid. For each cell you store the height and vertical velocity so you can simulate the motion. To step time forward you just apply the velocity to the position as normal, then also feed the position back into the velocity (when the water level is high, it wants to accelerate back down, etc). This makes the water bob up and down, but to make the waves propagate you just average each cell with it's neighbors. This simple filtering method is pretty effective and very fast! To interact with the water, you just need to change the height or velocity. It does have it's issues though. For one, it's difficult to make framerate independent as the waves move the same amount each step. It also doesn't _quite_ move like water waves.

![Water ripples in Metroid Prime](images/waves/metroid-water.jpg)
{: style="text-align: center"}

Interactive water ripples in Metroid Prime
{: style="text-align: center"}

This is where fourier based water simulation comes in. It lets you use much fancier filtering without too much extra cost, and it even makes it pretty intuitive. Instead of treating the grid like just a bunch of locations that has waves in it somehow, it lets you treat a bunch of different waves like they exist in a grid somehow. This makes it easier to handle some of the unique characteristics that make water look like water. For example, unlike sound or light, water waves don't all move at the same speed. Long waves move faster than little waves, and that gives water it's unique pulsing look as different waves interact in complicated ways. Jump Trajectory has a nice overview video about how they [implemented this technique](https://www.youtube.com/watch?v=kGEqaX4Y4bQ) in Unity. It's an excellent video, but a bit light on details perhaps. That's what I'd like to fill in with this article.

![Ocean waves in Assasin's Creed](images/waves/acbf-water.jpg)
{: style="text-align: center"}

FFT based ocean in Assasin's Creed
{: style="text-align: center"}

At the other end of the spectrum, there is full blown fluid dynamics. Don't just approximate the water's surface. Treat it like a real fluid with volume. This produces the best looking water as waves can crest and fall over and splash, or can even flow across surfaces. Unsurprisingly, it's also the most expensive method as it adds an entire dimension to be simulated! While I've never implemented proper fluid dynamics myself, it really doesn't look all that hard. Ten Minute Physics recently posted a video on [implementing the FLIP algorithm](https://youtu.be/XmzBREkK8kY) in 2D. It looks rather fun! There's also a neat library for 2D fluid simulation using particles based on Box2D called [Liquid Fun](https://google.github.io/liquidfun/).

## A Quick Water Wave Primer

The first thing to know about waves (or almost any periodic motion) is that it's just energy that's stuck in a loop. In the case of water, it's energy bounces back between kinetic and potential energy. When the water is high, gravity pulls it down. It picks up speed and overshoots, going too far down. Then the pressure of the water around it pushes it back up. It overshoots again, and goes too high. Rinse and repeat. (pun intended) 

![Wave cycle](images/waves/wave-cycle.svg)

# A Simple Wave

Let's start with a simple wave model: a sine wave. (I swear there will be very little trigonometry involved in this article) You'll probably remember that `sin(x)` gives you a nice wobbly line. If you want to animate it, you just need to change the phase using time: `sin(x + time)`. That produces a nice little animated wave like this one.

<canvas id="simple-wave" style="border:solid 1px #0002;"></canvas>

<script>
(function(){
	const canvas = document.getElementById("simple-wave")
	canvas.width = canvas.parentElement.clientWidth
	canvas.height = canvas.width/4
	const ctx = canvas.getContext("2d")
	
	let mfocus = false
	canvas.onmouseenter = (e => mfocus = true)
	canvas.onmouseleave = (e => mfocus = false)
	
	function animate(ms){
		const t = -1e-3*ms
		const n = 21
		
		ctx.save()
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		
		const scale = canvas.width/(n - 1)
		ctx.setTransform(scale, 0, 0, -scale, canvas.width/2, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		// Draw axis
		ctx.lineWidth = 1/scale
		ctx.strokeStyle = "#888"
		ctx.beginPath()
		ctx.moveTo(-100, 0); ctx.lineTo(+100, 0)
		ctx.moveTo(0, -100); ctx.lineTo(0, +100)
		ctx.stroke()
		
		// Draw velocity
		ctx.strokeStyle = "#F002"
		ctx.beginPath()
		for(let i = -n/2; i <= n/2; i++) ctx.lineTo(i, 2*Math.sin(i/2 + t))
		ctx.stroke()
		
		// Draw wave
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = -n/2; i <= n/2; i++) ctx.lineTo(i, 2*Math.cos(i/2 + t))
		ctx.stroke()
		
		
		const y = 2*Math.cos(t), vy = Math.sin(t)
		ctx.fillStyle = ctx.strokeStyle = "#F00"
		ctx.lineWidth = 2/scale
		
		// Draw dot
		ctx.beginPath()
		ctx.arc(0, y, 8/scale, 0, 2*Math.PI)
		ctx.fill()
		
		// Draw velocity line
		ctx.beginPath()
		ctx.moveTo(0, y); ctx.lineTo(0, y + vy)
		ctx.stroke()
		ctx.beginPath()
		ctx.moveTo(0, y + vy + Math.sign(vy)*0.3)
		ctx.lineTo(-0.15, y + vy)
		ctx.lineTo(+0.15, y + vy)
		ctx.fill()

		ctx.restore()
		window.requestAnimationFrame(animate)
	}
	
	animate(0)
})()
</script>

For reasons of simplicity the blue water line is actually `cos(x + time)`. That way we can plot the vertical velocity of the wave with `sin(x + time)`. It doesn't really matter, but setting it up this way lets you drop some pesky negative signs. Does this look like a water wave? Well... not really. For one, the shape is wrong. Real water waves have pointy peaks and flat troughs. The problem is that the water surface doesn't just move up and down. A better approximation is to move the surface around in circles. These are called [trochoidal](https://en.wikipedia.org/wiki/Trochoidal_wave) or gerstner waves.

<canvas id="gerstner-wave" style="border:solid 1px #0002;"></canvas>

<script>
(function(){
	const canvas = document.getElementById("gerstner-wave")
	canvas.width = canvas.parentElement.clientWidth
	canvas.height = canvas.width/4
	const ctx = canvas.getContext("2d")
	
	let foo = new IntersectionObserver(function(list){
		list[0].intersectionRatio
	})
	foo.observe(canvas)
	
	let mfocus = false
	canvas.onmouseenter = (e => mfocus = true)
	canvas.onmouseleave = (e => mfocus = false)
	
	function animate(ms){
		const t = -1e-3*ms
		const n = 21
		
		ctx.save()
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		
		const scale = canvas.width/(n - 1)
		ctx.setTransform(scale, 0, 0, -scale, canvas.width/2, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		// Draw wave
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = -n; i < n; i++) ctx.lineTo(i - 1.5*Math.sin(i/2 + t), 1.5*Math.cos(i/2 + t))
		ctx.stroke()
		
		// Draw circle
		ctx.strokeStyle = "#F004"
		ctx.lineWidth = 1/scale
		ctx.beginPath()
		ctx.arc(0, 0, 1.5, 0, 2*Math.PI)
		ctx.stroke()
		
		// Draw dot
		ctx.fillStyle = "#F00"
		ctx.beginPath()
		ctx.arc(-1.5*Math.sin(t), 1.5*Math.cos(t), 6/scale, 0, 2*Math.PI)
		ctx.fill()
		
		ctx.restore()
		window.requestAnimationFrame(animate)
	}
	
	animate(0)
})()
</script>

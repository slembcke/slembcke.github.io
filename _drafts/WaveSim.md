---
layout: post
title: "Wave Simulation"
description: "Wave Simulation with FFTs."
date: 2022-12-20
permalink: WaveSim
---

<script src="js/lifft.js" /></script>

<script>'use strict';
const WIDGETS = []

let VISIBILITY = new IntersectionObserver(function(list){
	for(let e of list) e.target.widget.visible = e.intersectionRatio > 0
})

class Widget {
	constructor(canvas_id, body){
		const canvas = this.canvas = document.getElementById(canvas_id)
		canvas.width = canvas.parentElement.clientWidth
		this.ctx = canvas.getContext("2d")
		
		this.repaint = body(this)
		this.visible = false
		WIDGETS.push(this)
		
		canvas.onmouseenter = (e => {
			this.mfocus = true
			this.mprev = this.mpos = {x: e.offsetX, y: e.offsetY}
		})
		canvas.onmouseleave = (e => this.mfocus = false)
		canvas.onmousemove = (e => this.mpos = {x: e.offsetX, y: e.offsetY})
		
		this.mfocus = false
		this.mpos = {x: 0, y: 0}
		this.mprev = {x: 0, y: 0}
		
		canvas.widget = this
		VISIBILITY.observe(canvas)
	}
}

let TIME = 0
function ANIMATE(ms){
	const time = 1e-3*ms
	const dt = (time - TIME) + Number.MIN_VALUE
	TIME = time
	
	for(let widget of WIDGETS){
		if(widget.visible){
			widget.dt = dt
			widget.mvel = {x:(widget.mpos.x - widget.mprev.x)/dt, y:(widget.mpos.y - widget.mprev.y)/dt};
			widget.mprev = widget.mpos;
			
			widget.ctx.clearRect(0, 0, widget.canvas.width, widget.canvas.height)
			widget.ctx.save()
			try {
				widget.repaint(time)
			} catch(e){
				console.error(e)
			}
			widget.ctx.restore()
		}
	}
	
	window.requestAnimationFrame(ANIMATE)
}
window.requestAnimationFrame(ANIMATE)
</script>

People _love_ water in video games. I can't count the number of times I've heard people talking about how realistic the water is in the latest and greatest game. I make no claims to be immune to it either as I've stopped to appreciate it's beauty in many a game. :)

![Water in Half Life 2](images/waves/hl2-water.jpg)
![Water in Subnautica](images/waves/subnautica-water.jpg)
{: style="text-align: center"}

Water in Half Life 2 and Subnautica.
{: style="text-align: center"}

Rendering and animating water are both pretty big topics, so this article is going to detail a particular algorithm for procedurally animating interactive water waves. Something like this!

<canvas id="wavies" style="border:solid 1px #0002;"></canvas>

<script>'use strict';
const AMPLITUDES = [
	0.0, 0.4, 2.0, 2.8, 3.5, 1.5, 3.0, 1.5,
	1.7, 1.2, 1.3, 0.6, 0.9, 0.4, 0.1, 0.4,
];

new Widget("wavies", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	const mradius = 20
	
	// Setup the waves with some initial frequencies in it.
	const spectra = lifft_complex_arr(64)
	for(let i = 0; i < AMPLITUDES.length; i++){
		const phase = 2*Math.PI*Math.random()
		spectra.re[i] = AMPLITUDES[i]*Math.cos(phase)
		spectra.im[i] = AMPLITUDES[i]*Math.sin(phase)
	}
	let waves = lifft_inverse_complex(spectra)
	
	// Interact with the waves using the mouse.
	function interact_waves(mvel, waves){
		// Calculate mouse position in wave coordinates
		const scale = waves.n/canvas.width
		const mx = widget.mpos.x*scale
		const my = canvas.height/2 - widget.mpos.y - waves.re[Math.floor(mx)]/scale
		
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
		
		// Now iterate over the +/- frequency pairs and update their phases and AMPLITUDES.
		for(let i = 0; i <= n/2; i++){
			const phase = -dt*Math.sqrt(i)*Math.PI, mag = Math.exp(-dt*damping*i)
			const w = lifft_complex(mag*Math.cos(phase), mag*Math.sin(phase));
			
			const p = lifft_cmul(w, lifft_complex(spectra_y.re[i], spectra_y.im[i]))
			spectra_x.re[i] = +p.im, spectra_x.im[i] = -p.re
			spectra_y.re[i] = +p.re, spectra_y.im[i] = +p.im
			
			const j = -i & (n - 1)
			const q = lifft_cmul(w, lifft_complex(spectra_y.re[j], spectra_y.im[j]))
			spectra_x.re[j] = -q.im, spectra_x.im[j] = +q.re
			spectra_y.re[j] = +q.re, spectra_y.im[j] = +q.im
		}
		
		return [lifft_inverse_complex(spectra_x), lifft_inverse_complex(spectra_y)]
	}
	
	return function(time){
		const dt = widget.dt, mvel = widget.mvel
		
		// Apply mouse interaction if necessary
		if(widget.mfocus && 0 < widget.mpos.x && widget.mpos.x < canvas.width) interact_waves(mvel, waves)
		
		// Update the waves.
		const [wave_x, wave_y] = update_waves(waves, 2e-2, dt)
		waves = wave_y
		
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
		ctx.arc(widget.mpos.x, widget.mpos.y, 20, 0, 2*Math.PI)
		ctx.fill()
		ctx.stroke()
		
		if(!widget.mfocus){
			ctx.setTransform(3, 0, 0, 3, canvas.width/2, canvas.height/3)
			ctx.fillStyle = "#0008"
			ctx.textAlign = "center"
			ctx.fillText("Use Mouse to Interact", 0, 0)
		}
	}
})
</script>

The algorithm itself extends to 3D easily enough, though I'll be doing it in 2D so it's easier to make quick visualizations.

## Lots of Water Algorithms

There's actually quite a lot of algorithms for simulating water. One of the simplest is to treat the water surface like a grid. For each cell you store the height and vertical velocity so you can simulate the motion. To step time forward you just apply the velocity to the position as normal, then also feed the position back into the velocity (when the water level is high, it wants to accelerate back down, etc). This makes the water bob up and down, but to make the waves propagate you just average each cell with it's neighbors. This simple filtering method is pretty effective and very fast! To interact with the water, you just need to change the height or velocity. It does have it's issues though. For one, it's difficult to make framerate independent as the waves move the same amount each step. It also doesn't _quite_ move like water waves.

![Water ripples in Metroid Prime](images/waves/metroid-water.jpg)
{: style="text-align: center"}

Interactive water ripples in Metroid Prime
{: style="text-align: center"}

This is where fourier based water simulation comes in using Fast Fourier Transforms, or FFTs. It lets you use much fancier filtering without too much extra cost, and it even makes it pretty intuitive. Instead of treating the grid like just a bunch of locations that has waves in it somehow, it lets you treat a bunch of different waves like they exist in a grid somehow. This makes it easier to handle some of the unique characteristics that make water look like water. For example, unlike sound or light, water waves don't all move at the same speed. Long waves move faster than little waves, and that gives water it's unique pulsing look as different waves interact in complicated ways. Jump Trajectory has a nice overview video about how they [implemented this technique](https://www.youtube.com/watch?v=kGEqaX4Y4bQ) in Unity. It's an excellent video, but a bit light on details perhaps. That's what I'd like to fill in with this article.

![Ocean waves in Assasin's Creed](images/waves/acbf-water.jpg)
{: style="text-align: center"}

FFT based ocean in Assasin's Creed
{: style="text-align: center"}

At the other end of the spectrum, there is full blown fluid dynamics. Don't just approximate the water's surface. Treat it like a real fluid with volume. This produces the best looking water as waves can crest and fall over and splash, or can even flow across surfaces. Unsurprisingly, it's also the most expensive method as it adds an entire dimension to be simulated! While I've never implemented proper fluid dynamics myself, it really doesn't look all that hard. Ten Minute Physics recently posted a video on [implementing the FLIP algorithm](https://youtu.be/XmzBREkK8kY) in 2D. It looks rather fun! There's also a neat library for 2D fluid simulation using particles based on Box2D called [Liquid Fun](https://google.github.io/liquidfun/).

## A Quick Water Wave Primer

The first thing to know about waves (or almost any periodic motion) is that it's just energy that's stuck in a loop. In the case of water, it's energy bounces back between kinetic and potential energy. When the water is high, gravity pulls it down. It picks up speed and overshoots, going too far down. Then the pressure of the water around it pushes it back up. It overshoots again, and goes too high. Rinse and repeat. (pun intended)

![Wave cycle](images/waves/wave-cycle.svg)

# A Simple Wave

Let's start with a simple wave model: a sine wave. (I swear there will be very little trigonometry involved in this article) You'll probably remember that `sin(x)` gives you a nice wobbly line. If you want to animate it, you just need to change the phase using time: `sin(x - time)`. That produces a nice little animated wave like this one.

<canvas id="simple-wave" style="border:solid 1px #0002;"></canvas>

A simple animated wave.
{: style="text-align: center"}

<script>'use strict';
new Widget("simple-wave", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	return function(t){
		const n = 20, scale = canvas.width/(n - 1)
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
		for(let i = -n/2; i <= n/2; i++) ctx.lineTo(i, 2*Math.sin(i/2 - t))
		ctx.stroke()
		
		// Draw spokes
		ctx.lineWidth = 1/scale
		ctx.strokeStyle = "#0002"
		ctx.beginPath()
		for(let i = -n/2; i <= n/2; i++){
			ctx.moveTo(i, 0); ctx.lineTo(i, 2*Math.cos(i/2 - t))
		}
		ctx.stroke()
		
		// Draw wave
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = -n/2; i <= n/2; i++) ctx.lineTo(i, 2*Math.cos(i/2 - t))
		ctx.stroke()
		
		const y = 2*Math.cos(-t), vy = Math.sin(-t)
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
	}
})
</script>

For reasons of simplicity the blue water line is actually `cos(x - time)`. That way we can plot the vertical velocity of the wave with `sin(x - time)`. It doesn't really matter, but setting it up this way lets you drop some pesky negative signs. Does this look like a water wave? Well... not really. For one, the shape is wrong. Real water waves have pointy peaks and flat troughs. The reason for this is because the surface of the water doesn't just move up and down, it actually moves in a circular shape. These are is called a [trochoidal](https://en.wikipedia.org/wiki/Trochoidal_wave) or gerstner waves. That's easy enough. If we add `cos(x - time)` to the wave's y position, then we just need to subtract `sin(x - time)` from the x position.

# A Better Wave

<canvas id="better-wave" style="border:solid 1px #0002;"></canvas>
<div style="display:flex; align-items:center; column-gap:1em">
	<label>Example:</label>
	<select id="example-select">
		<option value="trochoidal">Trochoidal Wave</option>
		<option value="sine">Sine Wave</option>
	</select>
	<label>Wavelength:</label> <input type="range" value="-0.5" min="-1.5" max="0.5" step="0.01" id="better-wave-wavelength"/>
	<label>Amplitude:</label> <input type="range" value="1" min="0" max="2" step="0.01" id="amplitude"/>
</div>

<textarea id="better-wave-code" rows="5" style="width:100%; font-size:125%" spellcheck="false"></textarea>
<pre id="better-wave-error" hidden="true"></pre>

<script>'use strict';
new Widget("better-wave", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	const EXAMPLE = {
		trochoidal: (
			"let phase = x/wavelength - time;\n" +
			"x_out = x - amplitude*sin(phase);\n" +
			"y_out = amplitude*cos(phase);\n"
		),
		sine: (
			"y_out = amplitude*cos(x/wavelength - time);\n"
		),
	}
	
	function compile(code){
		return Function(
			"x", "time", "amplitude", "wavelength",
			`'use strict';
				const {sin, cos, sqrt} = Math;
				let x_out = x, y_out = 0;
				${code};
				return [x_out, y_out];
			`
		)
	}
	
	const code_area = document.getElementById("better-wave-code")
	code_area.value = EXAMPLE.trochoidal
	
	let func = compile(code_area.value)
	code_area.oninput = (e => {
		const output = document.getElementById("better-wave-error")
		try {
			const f = compile(code_area.value)
			f(0, 0, 1, 1)
			func = f
			output.hidden = true
		} catch(err) {
			console.error(err)
			output.hidden = false
			output.textContent = err
		}
	})
	
	const example = document.getElementById("example-select")
	example.value = "trochoidal"
	example.oninput = (e => {
		code_area.value = EXAMPLE[example.value]
		code_area.oninput()
	})
	
	const wavelength_slider = document.getElementById("better-wave-wavelength")
	const amplitude_slider = document.getElementById("amplitude")
	
	return function(t){
		const n = 20, scale = canvas.width/(n - 1)
		ctx.setTransform(scale, 0, 0, -scale, canvas.width/2, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		// Draw axis
		ctx.lineWidth = 1/scale
		ctx.strokeStyle = "#888"
		ctx.beginPath()
		ctx.moveTo(-100, 0); ctx.lineTo(+100, 0)
		ctx.stroke()
		
		const wavelength = n*Math.exp(wavelength_slider.value)*0.5/Math.PI
		const amplitude = 0 + amplitude_slider.value
		
		// Draw spokes
		ctx.lineWidth = 1/scale
		ctx.strokeStyle = "#0002"
		ctx.beginPath()
		for(let i = -n/2; i <= n/2; i++){
			const [x, y] = func(i, t, amplitude, wavelength)
			ctx.moveTo(i, 0); ctx.lineTo(x, y)
		}
		ctx.stroke()
		
		// Draw wave
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = -n; i < n; i++){
			const [x, y] = func(i, t, amplitude, wavelength)
			ctx.lineTo(x, y)
		}
		ctx.stroke()
		
		const [x0, y0] = func(0, t, amplitude, wavelength)
		
		// Draw circle
		ctx.strokeStyle = "#F004"
		ctx.lineWidth = 1/scale
		ctx.beginPath()
		ctx.arc(0, 0, amplitude, 0, 2*Math.PI)
		ctx.stroke()
		
		// Draw dot
		ctx.fillStyle = "#F00"
		ctx.beginPath()
		ctx.arc(x0, y0, 6/scale, 0, 2*Math.PI)
		ctx.fill()
	}
})
</script>

This is starting to look much better, though with one a single wave frequency mixed in in looks pretty boring as it simply scrolls from one side of the screen to the other. Something that makes water interesting is that longer waves actually travel faster than short waves. (Imagine how weird it would be if sound or light worked that way!) Specifically, a wave's speed is inversely proportional to the square root of it's wavelength. To demonstrate, let's plot a second red wave with 1/4x the wavelength moving 1/2x as fast. The math for this works out to be `cos(x*4 - sqrt(4)*time)`.

# Mixing Waves

<canvas id="two-waves" style="border:solid 1px #0002;"></canvas>

<script>'use strict';
new Widget("two-waves", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	return function(t){
		const n = 80, scale = canvas.width/(n - 1)
		ctx.setTransform(scale, 0, 0, -scale, canvas.width/2, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		// Draw long wave
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = -n; i < n; i++) ctx.lineTo(i - 4*Math.sin(i/8 - t), 4*Math.cos(i/8 - t))
		ctx.stroke()
		
		// Draw short wave
		ctx.lineWidth = 2/scale
		ctx.strokeStyle = "#F00"
		ctx.beginPath()
		for(let i = -n; i < n; i++) ctx.lineTo(i - 1*Math.sin(i/2 - Math.sqrt(4)*t), 1*Math.cos(i/2 - Math.sqrt(4)*t))
		ctx.stroke()
	}
})
</script>

When plotted separately it looks... weird. It did not seem intuitive to me that the wave speeds could vary that much, but I was wrong! That's what gives water it's pulsating look as the peaks of the waves mix together when moving past one another. Just look at how watery the next wave looks when mixing the two wave offsets together and speeding time up to a normal amount. Lovely!

<canvas id="mixed-waves" style="border:solid 1px #0002;"></canvas>

<textarea id="two-wave-code" rows="10" style="width:100%; font-size:125%" spellcheck="false">
time *= 10; // Speed up time a bit
x_out = x, y_out = 0;

let amp0 = 3.0, len0 = 8;
x_out -= amp0*Math.sin(x/len0 - time/sqrt(len0));
y_out += amp0*Math.cos(x/len0 - time/sqrt(len0));

let amp1 = 0.5, len1 = 2;
x_out -= amp1*Math.sin(x/len1 - time/sqrt(len1));
y_out += amp1*Math.cos(x/len1 - time/sqrt(len1));
</textarea>
<pre id="two-wave-error" hidden="true"></pre>

<script>'use strict';
new Widget("mixed-waves", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	function compile(code){
		return Function(
			"x", "time",
			`'use strict';
				const {sin, cos, sqrt} = Math;
				let x_out = x, y_out = 0;
				${code};
				return [x_out, y_out];
			`
		)
	}

	const code_area = document.getElementById("two-wave-code")
	let func = compile(code_area.value)
	code_area.oninput = (e => {
		const output = document.getElementById("two-wave-error")
		try {
			const f = compile(code_area.value)
			f(0, 0)
			func = f
			output.hidden = true
		} catch(err) {
			console.error(err)
			output.hidden = false
			output.textContent = err
		}
	})

	return function(t){
		const n = 80, scale = canvas.width/(n - 1)
		ctx.setTransform(scale, 0, 0, -scale, canvas.width/2, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		// Draw long wave
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = -n; i < n; i++){
			let [x, y] = func(i, t)
			ctx.lineTo(x, y)
		}
		ctx.stroke()
	}
})
</script>

Mixing two waves looks so nice, you'd be correct to think that mixing more waves would make it look even better. The problem is how many do you need to mix? For each additional wave you need to calculate a whole lot more sines and cosines. Lets not even mention the 3D case where you might find yourself calculating a whole grid of wave directions for each wave for each grid point. Vertex shaders are fast, but not that fast! Also, wasn't this supposed to be an article about interactive water? How on earth do you interact with sine waves!?

## Mix All the Waves!

Since you already know that this article is about using the FFT to simulate water, perhaps you won't be surprised when I reveal that the FFT is the magical algorithm that can calculate 10's of thousands of sines and cosines without the cost. Even better, you don't really even need to know much about trigonometry. If you followed along with the scrolling sine waves above, you should be able to understand the rest of the article.

# The FFT Algorithm

The Fast Fourier Transform is an algorithm that can take a grid of N numbers that describe the water's surface (height and velocity), and turns it into a complete list of N sines and cosines for all the various sized waves present. It's companion, the inverse FFT, can take a list of sines and cosines and turn it back into the height and velocity. As it's name suggests, it's very fast. How the FFT works is beyond the scope of this article, but you should be able to find an FFT library for basically any programming language.

The FFT has a couple of quirks. First, it treats it's input as if it's repeating. This is extremely handy if you want a result that is tileable. If you don't, then you'll need to leave some dead space at the edges where you can clamp the waves down to zero to prevent them from wrapping around. Another quirk is that the size of the input has to be a power of two (2, 4, 8, 16, etc). It's possible to work around that, but it's much easier to just work with the limitation.

The input and output of the FFT is fairly straightforward too once you see the pattern. It does use complex numbers, but don't worry if that gives you dread. The scrolling waves above already used them, and that's kinda all you need to know. Complex numbers have a "real" and "imaginary" part that are like the x and y parts of a 2D vector. For example, say you had a list of just 8 points that made up your water's surface. Using the FFT would look something like this:

```python
# The input is 8 complex numbers
water_input = [
	complex_number(height[0], velocity[0]),
	complex_number(height[1], velocity[1]),
	...
	complex_number(height[7], velocity[7]),
]

wave_output = fft(water_input)

# The output is the same number of complex numbers.
wave_output[0] # The average height/velocity of the water
wave_output[1] # The wave that has length grid_size/1
wave_output[2] # The wave that has length grid_size/2
wave_output[3] # The wave that has length grid_size/3
wave_output[4] # The wave that has length grid_size/4
wave_output[5] # The wave that has length grid_size/3, but moves backwards
wave_output[6] # The wave that has length grid_size/2, but moves backwards
wave_output[7] # The wave that has length grid_size/1, but moves backwards
```

The output numbers are also complex numbers, they represent the sines and cosines of the waves. Think of it like a 2D vector again. The length of the vector is the wave's amplitude, and the angle it points in is the wave's phase.

To use the FFT in 3D, you would apply it to the rows of the grid first. Then apply it to the columns. (or the other way around, the order doesn't matter) It might seem weird to apply the FFT to the columns when they already contain wave information, but surprisingly the FFT is a separable linear transform which means you can take that computational shortcut!

Finally, the inverse FFT is the exact opposite. You give it a list of N complex numbers describing the waves, and it gives you back N numbers with the height and velocity of each wave. No surprises.

# Animating Water with the FFT

Enough explanations! We already know how to make waves by animating some sines and cosines, and we have a magic algorithm that can calculate a lot of sines and cosines efficiently. Lets put the two together and animate some waves!

<canvas id="fft-waves" style="border:solid 1px #0002;"></canvas>

Many waves mixed together with an FFT.
{: style="text-align: center"}

<script>'use strict';
new Widget("fft-waves", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	// Setup the waves with some initial frequencies in it.
	const spectra = lifft_complex_arr(64)
	for(let i = 0; i < AMPLITUDES.length; i++){
		const phase = 2*Math.PI*Math.random()
		spectra.re[i] = AMPLITUDES[i]*Math.cos(phase)
		spectra.im[i] = AMPLITUDES[i]*Math.sin(phase)
	}
	
	return function(t){
		const spectra_y = lifft_complex_arr(64)
		for(let i = 0; i < spectra.n; i++){
			const phase = -t*Math.sqrt(i)*Math.PI
			const w = lifft_complex(Math.cos(phase), Math.sin(phase));
			
			const p = lifft_cmul(w, lifft_complex(spectra.re[i], spectra.im[i]))
			spectra_y.re[i] = p.re
			spectra_y.im[i] = p.im
		}
		const water_y = lifft_inverse_complex(spectra_y)
		
		const scale = canvas.width/(water_y.n - 1)
		ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		ctx.beginPath()
		for(let i = 0; i < water_y.n; i++){
			ctx.lineTo(i - 1.0*water_y.im[i], water_y.re[i])
		}
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.stroke()
	}
})
</script>

That looks pretty good to my eyes. With all the wavefronts passing one another it looks almost random, but yet it's _entirely_ predcitable. The waves that make up the water always have the same amplitude, and only their phase is shifted to the current time using the same method as the simpler waves from earlier. The only difference is now there are over a dozen waves instead of just two. Lets look at some psuedo-code:

```python
# Amplitudes of the various waves at start
# I kinda just made these up favoring longer wavelengths.
AMPLITUDES = [...]

# Calculate the starting waves.
# I use the amplitudes with a random phase.
# The random phose prevents them from all lining up at start.
WAVES = complex_array_with_length(64)
for i in 0 to WAVES.length:
	amp, phase = AMPLITUDES[i], 2*PI*random()
	WAVES[i] = complex_number(amp*cos(phase), amp*sin(phase))

def update_water(time):
	# Make a copy of the waves with updated phases.
	waves = complex_array_with_length(WAVES.length)
	for i in 0 to WAVES.length:
		# Calculate the phase for like we did with sines/cosines.
		const phase = -t*sqrt(i)
		# Make a complex number with the phase angle we want.
		const w = complex_number(cos(phase), sin(phase));
		# Complex multiplication adds the phase angles.
		waves[i] = complex_multiply(w, WAVES[i])
	
	# All of the waves are ready. Do all the sines/cosines!
	water = fft_inverse(waves)
	return water
```

TODO Waves moving backwards are broken though

<canvas id="broken-waves" style="border:solid 1px #0002;"></canvas>

<script>'use strict';
new Widget("broken-waves", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	// Setup the waves with some initial frequencies in it.
	const spectra = lifft_complex_arr(64)
	spectra.re[64 - 4] = 10
	
	return function(t){
		const spectra_y = lifft_complex_arr(64)
		for(let i = 0; i < spectra.n; i++){
			const phase = -t*Math.sqrt(i)*Math.PI
			const w = lifft_complex(Math.cos(phase), Math.sin(phase));
			
			const p = lifft_cmul(w, lifft_complex(spectra.re[i], spectra.im[i]))
			spectra_y.re[i] = p.re
			spectra_y.im[i] = p.im
		}
		const water_y = lifft_inverse_complex(spectra_y)
		
		const scale = canvas.width/(water_y.n - 1)
		ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		ctx.beginPath()
		for(let i = 0; i < water_y.n; i++){
			ctx.lineTo(i - 1.0*water_y.im[i], water_y.re[i])
		}
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.stroke()
	}
})
</script>

TODO Changing the math to fix backwards waves

<canvas id="backwards-waves" style="border:solid 1px #0002;"></canvas>

<script>'use strict';
new Widget("backwards-waves", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	// Setup the waves with some initial frequencies in it.
	const spectra = lifft_complex_arr(64)
	spectra.re[64 - 4] = 10
	
	return function(t){
		const spectra_x = lifft_complex_arr(64)
		const spectra_y = lifft_complex_arr(64)
		for(let i = 0; i < spectra.n/2; i++){
			const phase = -t*Math.sqrt(i)*Math.PI
			const w = lifft_complex(Math.cos(phase), Math.sin(phase));
			
			const p = lifft_cmul(w, lifft_complex(spectra.re[i], spectra.im[i]))
			spectra_x.re[i] = -p.im, spectra_x.im[i] = +p.re
			spectra_y.re[i] = +p.re, spectra_y.im[i] = +p.im
			
			const j = -i & (spectra.n - 1)
			const q = lifft_cmul(w, lifft_complex(spectra.re[j], spectra.im[j]))
			spectra_x.re[j] = +q.im, spectra_x.im[j] = -q.re
			spectra_y.re[j] = +q.re, spectra_y.im[j] = +q.im
		}
		const water_x = lifft_inverse_complex(spectra_x)
		const water_y = lifft_inverse_complex(spectra_y)
		
		const scale = canvas.width/(water_y.n - 1)
		ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = 0; i < water_y.n; i++) ctx.lineTo(i + water_x.re[i], water_y.re[i])
		ctx.stroke()
	}
})
</script>

TODO One last step, turning it into a simulation.

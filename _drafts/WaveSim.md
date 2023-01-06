---
layout: post
title: "Water Wave Simulation"
description: "Water wave animation and simulation using FFTs."
date: 2022-12-20
permalink: WaterWaves
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
		canvas.onmouseleave = (e => this.mfocus = this.mleft = this.mright = false)
		canvas.onmousemove = (e => this.mpos = {x: e.offsetX, y: e.offsetY})
		canvas.onmouseup = canvas.onmousedown = (e => {
			this.mleft = ((e.buttons & 1) != 0)
			this.mright = ((e.buttons & 2) != 0)
		})
		canvas.oncontextmenu = (e => false)
		
		this.mfocus = false
		this.mpos = {x: 0, y: 0}
		this.mprev = {x: 0, y: 0}
		
		canvas.widget = this
		VISIBILITY.observe(canvas)
	}
	
	get mlocal(){
		const {x, y} = this.mpos
		const m = this.ctx.getTransform().inverse()
		return {x:x*m.a + y*m.c + m.e, y:x*m.b + y*m.d + m.f}
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

Rendering and animating water are both pretty big topics, so this article is going to detail an algorithm for procedurally simulating interactive water waves using FFTs. Something like this!

<canvas id="wavies" style="border:solid 1px #0002;"></canvas>

<script>'use strict';
const AMPLITUDES = [
	0.0, 4.0, 6.4, 5.4,
	2.7, 0.6, 0.5, 0.6,
	1.0, 1.0, 0.7, 0.3,
	0.2, 0.5, 0.6, 0.2
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

Keep in mind that it's a just surface simulation, so horizontal mouse movements faster than the wave speed won't be very satisfying. ;) The algorithm itself extends to 3D easily enough, though I'll be doing it in 2D so it's easier to make quick visualizations.

## Lots of Water Algorithms

There's actually quite a lot of algorithms for simulating water. One of the simplest is to treat the water surface like a grid. For each cell you store the height and vertical velocity so you can simulate the motion. To step time forward you move the height with the velocity, then feed the height back into the velocity (when the water level is high it wants to accelerate back down, and vice versa). This makes the water bob up and down. To make the waves propagate you just need to average each cell with it's neighbors. This easy filtering method is pretty effective and very fast! To interact with the water, you just change the height or velocity values. Though delightfully simple to implement, it does have it's issues though. For one, it's difficult to make framerate independent as the waves will move the same amount each step. It also doesn't _really_ move like water waves for a few reasons.

![Water ripples in Metroid Prime](images/waves/metroid-water.jpg)
{: style="text-align: center"}

Interactive water ripples in Metroid Prime
{: style="text-align: center"}

This is where fourier based water simulation comes in using Fast Fourier Transforms, or FFTs. It gives you an intuitive way to perform much fancier filtering, and without a lot of extra cost! Instead of treating the grid like a bunch of locations that have waves in them somehow, the fourier transform lets you convert the grid to a list of waves, and then back into a grid. This makes it easier to handle some of water's unique characteristics. For example, unlike sound or light, water waves don't all move at the same speed. Long waves move faster than little waves giving water it's unique pulsing look as the different waves interact in complicated ways. Jump Trajectory has a nice overview video about how they [implemented the FFT technique](https://www.youtube.com/watch?v=kGEqaX4Y4bQ) in Unity. It's an excellent video, but it's light on the details and assumes you already know how FFTs work. That's what I'd like to fill in with this article.

![Ocean waves in Assasin's Creed](images/waves/acbf-water.jpg)
{: style="text-align: center"}

FFT based ocean waves in Assasin's Creed
{: style="text-align: center"}

At the extreme end of the spectrum, you can simulate the whole volume of water using fluid dynamics instead of just approximating it's surface. Waves can crest and fall over, they can splash, and the water can even pour across surfaces. Unsurprisingly, adding another dimension is _really_ expensive and simulating the whole volume usually isn't feasible except at low resolutions. While I've never implemented proper fluid dynamics myself, it really doesn't look all that hard. Ten Minute Physics recently posted a video on [implementing the FLIP algorithm](https://youtu.be/XmzBREkK8kY) in 2D. It looks surprisingly simple and fun! There's also a neat 2D fluid simulation library based on Box2D called [Liquid Fun](https://google.github.io/liquidfun/).

![Water simulated using the FLIP algorithm](images/waves/10minute-water.jpg)
{: style="text-align: center"}

A fluid simulationg using the FLIP algorithm from the 10 Minute Physics [blog](https://matthias-research.github.io/pages/tenMinutePhysics/index.html)
{: style="text-align: center"}

## A Quick Water Wave Primer

The first thing to know about waves (or almost any periodic motion really) is that it's just energy that's stuck in a loop. In the case of water, it's energy bounces back between kinetic and potential energy. When the water is high, gravity pulls it down. It picks up speed and overshoots, going too far down. Then the pressure of the water around it pushes it back up. It overshoots again, and goes too high. Rinse and repeat. (pun intended)

![Wave cycle](images/waves/wave-cycle.svg)
{: style="text-align: center"}

A [phase plot](https://en.wikipedia.org/wiki/Phase_space#Phase_plot) of the water surface
{: style="text-align: center"}

# The Simplest Wave

Let's start with a simple wave model: a sine wave. (I swear there will be very little trigonometry involved in this article.) You'll probably remember that `y = sin(x)` gives you a nice wobbly line. If you want to animate it, you just need to change the phase using time: `y = sin(x - time)`. That produces a nice little animated wave that moves left to right like this one.

<canvas id="simple-wave" style="border:solid 1px #0002;"></canvas>

A simple animated wave
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

If the blue line is the water height, can you guess what the red line is? (Hint: watch the red arrow.) It's the water's vertical velocity. When the velocity is up it makes the height move up, and when the height is up it makes the velocity move down. Another way of looking at it is that the velocity wave pulls the height wave. If you swapped their positions it would make the wave move to the right instead. The velocity will be important later when we talk about simulating waves, but for now let's take a shortcut and just animate them.

# A Better Wave

So then, does this animated sine wave look like a water wave? Well... not really. First of all, if you compare it to the waves in the Assasin's Creed screenshot above, it's the wrong shape. Those waves have pointy peaks and wide troughs. The reason for this is because real water waves don't just bob up and down, they _roll_ in roughly circlular path. This is called a [trochoidal](https://en.wikipedia.org/wiki/Trochoidal_wave) wave (sometimes called gerstner waves in computer graphics stuff). That's easy enough! Instead of just moving the vertexes up and down, we add something to move them back and forth too. While we are making changes, lets make add a wavelength and amplitude property. Now our height is:

`y = amplitude*sin(x/wavelength - time)`

(_Technically_ you need π represented in there for the wavelength, but if you don't care about using real units, then it doesn't matter.)

Each time a wave finishes a cycle, it moves forward by one wavelength. This is a mild problem because longer waves will move faster. If we want our waves to move at the same speed, then we need to slow down waves proportionally by their wavelength. Easy enough, just divide time to slow it down:

`y = amplitude*sin(x/wavelength - time/wavelength)`

Also for reason we'll get into later when we talk about FFTs, let's swap that for a cosine instead. Lastly, since we are talking about circles, there's surely a matched pair of sines and cosines involved. So the final trochoidal wave code would look something like this:

<canvas id="better-wave" style="border:solid 1px #0002;"></canvas>
<div style="display:flex; align-items:center; column-gap:1em">
	<label>Example:</label>
	<select id="example-select">
		<option value="trochoidal">Trochoidal Wave</option>
		<option value="sine">Sine Wave</option>
	</select>
	<label>Wavelength:</label> <input type="range" style="width:120px" value="-0.5" min="-1.5" max="0.5" step="any" id="better-wave-wavelength"/>
	<label>Amplitude:</label>  <input type="range" style="width:120px" value=" 1.0" min=" 0.0" max="2.0" step="any" id="better-wave-amplitude" />
</div>

<textarea id="better-wave-code" rows="4" style="width:100%; font-size:125%" spellcheck="false"></textarea>
<pre id="better-wave-error" hidden="true"></pre>

Edit this code!
{: style="text-align: center"}

<script>'use strict';
new Widget("better-wave", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	const EXAMPLE = {
		trochoidal: (
			"let phase = x/wavelength - time/wavelength;\n" +
			"x_out = x - amplitude*sin(phase);\n" +
			"y_out = amplitude*cos(phase);\n"
		),
		sine: (
			"y_out = amplitude*cos(x/wavelength - time/wavelength);\n"
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
	const amplitude_slider = document.getElementById("better-wave-amplitude")
	
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
		const time = 4*t
		
		// Draw spokes
		ctx.lineWidth = 1/scale
		ctx.strokeStyle = "#0002"
		ctx.beginPath()
		for(let i = -n/2; i <= n/2; i++){
			const [x, y] = func(i, time, amplitude, wavelength)
			ctx.moveTo(i, 0); ctx.lineTo(x, y)
		}
		ctx.stroke()
		
		// Draw wave
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = -n; i < n; i++){
			const [x, y] = func(i, time, amplitude, wavelength)
			ctx.lineTo(x, y)
		}
		ctx.stroke()
		
		const [x0, y0] = func(0, time, amplitude, wavelength)
		
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

* What happens if you add time instead of subtracting it?
* What happens if you add the sine to the x coordinate instead of subtracting it?
* What happens if you swap the sine and cosine? Can you change the speed of the wave?

Lastly, if you didn't _immediately_ crank the wavelength and amplitude to their extremes, try it! If the ratio of the amplitude compared to the wavelength is too high, the trochoidal motion breaks down. A real wave would fall over and turn turbulent, turning it into a "breaking wave". We can sort of deal with this in our simple surface simulation, but you need real fluid dynamics to do it properly.

![example of a breaking wave](images/waves/wave-break.jpg)
{: style="text-align: center"}

By Steve Jurvetson from Menlo Park, USA - Step Into Liquid, CC BY 2.0, [link](https://commons.wikimedia.org/w/index.php?curid=3561785)
{: style="text-align: center"}


# Mixing Waves

This is starting to look much better, but our trochoidal wave with a single wavelength is still really plain. Real waves are never quite quite the same size, and their pattern is a little irregular too. Does that mean you need to use random numbers? Perhaps surprisingly, no. Real water waves are almost always a composite of many simpler waves just like ours above. Individually they move in extremely predictable ways, but when mixed together they can look almost random.

Water waves have a trick that helps with this random appearance too. Unlike sound or light, water waves don't all move at the same speed. (Think about how weird that is for a second...) Specifically, a wave's speed is proportional to the square root of it's wavelength, so we just need to multiply that into our time factor like this:

```
y = amplitude*cos(x/wavelength - time*sqrt(wavelength)/wavelength)
```

Which simplifies to:

```
y = amplitude*cos(x/wavelength - time/sqrt(wavelength))
```

If we plot these waves separately, you can see that the blue wave has 4x the wavelength of the red wave, and moves 2x as fast. At least to my eyes, this looks... impossible. I still have a hard time accepting that water waves move like this, but apparently they do!

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
		for(let i = -n; i < n; i++){
			const phase = i/8 - t*10/Math.sqrt(8)
			ctx.lineTo(i - 3*Math.sin(phase), 3*Math.cos(phase))
		}
		ctx.stroke()
		
		// Draw short wave
		ctx.lineWidth = 2/scale
		ctx.strokeStyle = "#F00"
		ctx.beginPath()
		for(let i = -n; i < n; i++){
			const phase = i/2 - t*10/(2/Math.sqrt(2))
			ctx.lineTo(i - 0.5*Math.sin(phase), 0.5*Math.cos(phase))
		}
		ctx.stroke()
	}
})
</script>

Mixing waves together is easy, you just add them together. In the case of trochoidal waves, you just add up all the cosines for the vertical position and all the sines for the horizontal offsets. Once you do that, you'll get a lovely wave with that signature "pulsing" look that real water waves get. Give it a try!

<canvas id="mixed-waves" style="border:solid 1px #0002;"></canvas>

<textarea id="two-wave-code" rows="10" style="width:100%; font-size:125%" spellcheck="false">
x_out = x, y_out = 0;

let amp0 = 3.0, len0 = 8;
x_out -= amp0*sin(x/len0 - time/sqrt(len0));
y_out += amp0*cos(x/len0 - time/sqrt(len0));

let amp1 = 0.5, len1 = 2;
x_out -= amp1*sin(x/len1 - time/sqrt(len1));
y_out += amp1*cos(x/len1 - time/sqrt(len1));
</textarea>
<pre id="two-wave-error" hidden="true"></pre>

Edit this code!
{: style="text-align: center"}

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
			let [x, y] = func(i, 10*t)
			ctx.lineTo(x, y)
		}
		ctx.stroke()
	}
})
</script>

* Try different wavelengths
* Try dividing by wavelength like before instead of it's square root
* Can you cause the wave to break by adding smaller waves that are fine independently?
* What happens if you pick wavelengths that are similar?

If Mixing two waves looks so nice, you'd be correct to think that mixing more waves would make it look even better. The problem is how many do you need? For each additional wave you need to calculate a whole lot more sines and cosines. It gets even worse when you need to do this in 3D. CPUs and GPUs are insanely fast, but at some point brute forcing a problem won't work. Also, wasn't this supposed to be an article about interactive water simulation? How on earth do you interact with sine waves!?

## Mix All the Waves!

Since you already know that this article is about using the FFT to simulate water, perhaps you won't be surprised when I reveal that the FFT is the magical algorithm that can calculate 10's of thousands of sines and cosines without the cost. Even better, you don't really even need to know much about trigonometry. If you followed along with the scrolling sine waves above, you should be able to understand the rest of the article.

# The FFT Algorithm

<canvas id="fft-io" style="border:solid 1px #0002;"></canvas>

Use the left mouse button to change values, or right mouse button to clear them.
{: style="text-align: center"}

<script>'use strict';
new Widget("fft-io", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/2
	
	const N = 16
	let input, output = lifft_complex_arr(N)
	function calc_input(){input = lifft_inverse_complex(output)}
	function calc_output(){output = lifft_forward_complex(input)}
	
	output.im[1] = -0.7
	calc_input()
	
	function draw_bars(x, y, centered, f){
		let scale = 70, min, max
		if(centered){
			ctx.setTransform(15, 0, 0, -scale, x*canvas.width, y*canvas.height)
			min = -1, max = 1
		} else {
			ctx.setTransform(15, 0, 0, -2*scale, x*canvas.width, y*canvas.height + scale)
			scale *= 2, min = 0, max = 1
		}
		
		ctx.fillStyle = "#DDD"
		for(let i = 0; i < N; i++) ctx.fillRect(i - N/2, min, 0.9, max - min)
		
		ctx.fillStyle = "#08C"
		for(let i = 0; i < N; i++){
			const value = Math.max(min, Math.min(f(i), max))
			ctx.fillRect(i - N/2, 0, 0.9, value)
		}
		
		ctx.strokeStyle = "#000"
		ctx.lineWidth = 1/scale
		ctx.beginPath()
		ctx.lineTo(-N/2, 0)
		ctx.lineTo(+N/2, 0)
		ctx.stroke()
	}
	
	function mouse_input(min, f){
		const {x, y} = widget.mlocal
		if(-N/2 < x && x < N/2 && min < y && y < 1){
			const mi = Math.floor(x + N/2)
			if(widget.mleft) f(mi, y)
			if(widget.mright) f(mi, 0)
		}
	}
	
	function get_abs(arr, i){return Math.hypot(arr.re[i], arr.im[i])}
	function set_abs(arr, i, v){
		const abs = get_abs(arr, i)
		if(abs > 0){
			const coef = v/(get_abs(arr, i) + Number.MIN_VALUE)
			arr.re[i] *= coef
			arr.im[i] *= coef
		} else {
			arr.re[i] = v
		}
	}
	
	function get_arg(arr, i){return Math.atan2(arr.im[i], arr.re[i])/Math.PI}
	function set_arg(arr, i, v){
		const abs = get_abs(arr, i)
		arr.re[i] = abs*Math.cos(v*Math.PI)
		arr.im[i] = abs*Math.sin(v*Math.PI)
	}
	
	return function(t){
		draw_bars(0.2, 0.25, true, i => 4*input.re[i])
		mouse_input(-1, (i, v) => {input.re[i] = v/4; calc_output()})
		draw_bars(0.2, 0.75, true, i => 4*input.im[i])
		mouse_input(-1, (i, v) => {input.im[i] = v/4; calc_output()})
		
		draw_bars(0.8, 0.25, false, i => get_abs(output, i))
		mouse_input(0, (i, v) => {set_abs(output, i, v); calc_input()})
		draw_bars(0.8, 0.75, true, i => get_arg(output, i))
		mouse_input(-1, (i, v) => {set_arg(output, i, v); calc_input()})
		
		{
			ctx.textAlign = "center"
			ctx.textBaseline = "middle"
			ctx.fillStyle = "#000"
			
			ctx.setTransform(1, 0, 0, 1, 0.5*canvas.width, 0.5*canvas.height)
			ctx.lineWidth = 1
			ctx.strokeStyle = "#000"
			const w = 190, h = 100
			ctx.strokeRect(-w/2, -h/2, w, h)
			
			const scale = 2
			ctx.transform(scale, 0, 0, scale, 0, 0)
			ctx.strokeRect(0.5*(canvas.width - w), 0.5*(canvas.height - h), w, h)
			
			ctx.fillText("fft() -->", 0, -10)
			ctx.fillText("<-- inverse_fft()", 0, 10)
			
			ctx.setTransform(scale, 0, 0, scale, 0.2*canvas.width, 0.5*canvas.height)
			ctx.fillText("Water Surface (x)", 0, 0)
			
			ctx.setTransform(0, -scale, scale, 0, 0.02*canvas.width, 0.25*canvas.height)
			ctx.fillText("Height (y)", 0, 0)
			ctx.setTransform(0, -scale, scale, 0, 0.02*canvas.width, 0.75*canvas.height)
			ctx.fillText("Velocity (y)", 0, 0)
			
			ctx.setTransform(0, -scale, scale, 0, 0.98*canvas.width, 0.25*canvas.height)
			ctx.fillText("Amplitude", 0, 0)
			ctx.setTransform(0, -scale, scale, 0, 0.98*canvas.width, 0.75*canvas.height)
			ctx.fillText("Phase Angle", 0, 0)
			
			ctx.setTransform(scale, 0, 0, scale, 0.8*canvas.width, 0.5*canvas.height)
			ctx.fillText("Waves (frequencies)", 0, 0)
		}
	}
})
</script>

~~The Fast Fourier Transform is an algorithm that can take a grid of N numbers that describe the water's surface (height and velocity), and turns it into a complete list of N sines and cosines for all the various sized waves present. It's companion, the inverse FFT, can take a list of sines and cosines and turn it back into the height and velocity. As it's name suggests, it's very fast. How the FFT works is beyond the scope of this article, but you should be able to find an FFT library for basically any programming language.~~

~~The FFT has a couple of quirks. First, it treats it's input as if it's repeating. This is extremely handy if you want a result that is tileable. If you don't, then you'll need to leave some dead space at the edges where you can clamp the waves down to zero to prevent them from wrapping around. Another quirk is that the size of the input has to be a power of two (2, 4, 8, 16, etc). It's possible to work around that, but it's much easier to just work with the limitation.~~

~~The input and output of the FFT is fairly straightforward too once you see the pattern. It does use complex numbers, but don't worry if that gives you dread. The scrolling waves above already used them, and that's kinda all you need to know. Complex numbers have a "real" and "imaginary" part that are like the x and y parts of a 2D vector. For example, say you had a list of just 8 points that made up your water's surface. Using the FFT would look something like this:~~


~~The output numbers are also complex numbers, they represent the sines and cosines of the waves. Think of it like a 2D vector again. The length of the vector is the wave's amplitude, and the angle it points in is the wave's phase.~~

~~To use the FFT in 3D, you would apply it to the rows of the grid first. Then apply it to the columns. (or the other way around, the order doesn't matter) It might seem weird to apply the FFT to the columns when they already contain wave information, but surprisingly the FFT is a separable linear transform which means you can take that computational shortcut!~~

~~Finally, the inverse FFT is the exact opposite. You give it a list of N complex numbers describing the waves, and it gives you back N numbers with the height and velocity of each wave. No surprises.~~

# Animating Water with the FFT

Enough explanations! We already know how to make waves by animating some sines and cosines, and we have a magic algorithm that can calculate a lot of sines and cosines efficiently. Lets put the two together and animate some waves!

<canvas id="fft1-waves" style="border:solid 1px #0002;"></canvas>

<textarea id="fft1-code" rows="8" style="width:100%; font-size:125%" spellcheck="false">
for(let i = 0; i < waves.n; i++){
  let phase = -time*sqrt(i)
  let phase_complex = complex(cos(phase), sin(phase));
  waves[i] = complex_multiply(phase_complex, waves[i])
}
water = inverse_fft(waves)
</textarea>
<pre id="fft1-error" hidden="true"></pre>

<script>'use strict';
const COMPLEX_ARRAY_PROXY = {
	get: (arr, idx) => arr[idx] || lifft_complex(arr.re[idx], arr.im[idx]),
	set: (arr, idx, val) => {
		arr.re[idx] = val.re
		arr.im[idx] = val.im
		return true
	},
};

const SPECTRA = lifft_complex_arr(64), phases = []
for(let i = 0; i < SPECTRA.n; i++){
	SPECTRA.re[i] = AMPLITUDES[i] || 0
	phases[i] = 2*Math.PI*Math.random()
}

new Widget("fft1-waves", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	function compile(code){
		return Function(
			"time", "_spectra",
			`'use strict';
				const {cos, sin, sqrt} = Math
				const complex = lifft_complex, complex_multiply = lifft_cmul, inverse_fft = lifft_inverse_complex
				const waves = new Proxy(_spectra, COMPLEX_ARRAY_PROXY)
				let water = lifft_complex_arr(_spectra.n)
				${code}
				return water
			`
		)
	}

	const code_area = document.getElementById("fft1-code")
	let func = compile(code_area.value)
	code_area.oninput = (e => {
		const output = document.getElementById("fft1-error")
		try {
			const f = compile(code_area.value)
			f(0, lifft_complex_arr(SPECTRA.n))
			func = f
			output.hidden = true
		} catch(err) {
			console.error(err)
			output.hidden = false
			output.textContent = err
		}
	})
	
	return function(t){
		// Init spectra with SPECTRA*phases.
		const spectra = lifft_complex_arr(SPECTRA.n)
		for(let i = 0; i < SPECTRA.n; i++){
			const w = lifft_complex(Math.cos(phases[i]), Math.sin(phases[i]));
			const p = lifft_cmul(w, lifft_complex(SPECTRA.re[i], SPECTRA.im[i]))
			spectra.re[i] = p.re
			spectra.im[i] = p.im
		}
		
		const water = func(4*t, spectra)
		
		const scale = canvas.width/(water.n - 1)
		
		ctx.setTransform(canvas.width/water.n, 0, 0, -5, 0, canvas.height)
		const {x:mx, y:my} = widget.mlocal
		const mi = Math.floor(Math.max(0, Math.min(mx, SPECTRA.n - 1)))
		const mi_signed = (mi ^ SPECTRA.n/2) - SPECTRA.n/2
		
		if(widget.mleft) SPECTRA.re[mi] = my/(mi == 0 ? 1 : Math.abs(mi_signed))
		if(widget.mright) SPECTRA.re[mi] = 0
		
		for(let i = 0; i < SPECTRA.n; i++){
			ctx.fillStyle = i == mi ? "#0F04" : "#0002"
			const weight = i == 0 ? 1 : (SPECTRA.n/2 - Math.abs(SPECTRA.n/2 - i))
			ctx.fillRect(i, 0, 0.9, weight*SPECTRA.re[i]);
		}
		
		ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = 0; i < water.n; i++) ctx.lineTo(i - water.im[i], water.re[i])
		ctx.stroke()
		
		ctx.fillStyle = "#0008"
		ctx.textAlign = "center"
		ctx.setTransform(2, 0, 0, 2, 0.5*canvas.width, 0.25*canvas.height)
		ctx.fillText("Left drag to set spectrum. Right drag to clear.", 0, 0)
		
		if(widget.mfocus){
			ctx.setTransform(2, 0, 0, 2, 0.5*canvas.width, 0.75*canvas.height)
			ctx.fillText(`Wavelength: ${(1/mi_signed).toPrecision(2)}, Amplitude: ${SPECTRA.re[mi].toPrecision(1)}`, 0, 0)
		}
	}
})
</script>

That looks pretty good to my eyes. With all the wavefronts passing one another it looks almost random, but yet it's _entirely_ predcitable. The waves that make up the water always have the same amplitude, and only their phase is shifted to the current time using the same method as the simpler waves from earlier. The only difference is now there are over a dozen waves instead of just two. Lets look at some psuedo-code:

TODO Waves moving backwards are broken though

<canvas id="fft2-waves" style="border:solid 1px #0002;"></canvas>

<textarea id="fft2-code" rows="16" style="width:100%; font-size:125%" spellcheck="false">
for(let i = 0; i <= waves.n/2; i++){
  let phase = -time*sqrt(i)
  let phase_complex = complex(cos(phase), sin(phase));
  
  let p = complex_multiply(phase_complex, waves[i]);
  waves_x[i] = complex(-p.im, p.re);
  waves_y[i] = p;
  
  let j = (waves.n - i) % waves.n
  let q = complex_multiply(phase_complex, waves[j])
  waves_x[j] = complex(q.im, -q.re)
  waves_y[j] = q
}
water_x = inverse_fft(waves_x)
water_y = inverse_fft(waves_y)
</textarea>
<pre id="fft2-error" hidden="true"></pre>

<script>'use strict';
new Widget("fft2-waves", widget => {
	const {canvas, ctx} = widget
	canvas.height = canvas.width/4
	
	
	function compile(code){
		return Function(
			"time", "_spectra",
			`'use strict';
				const {cos, sin, sqrt} = Math
				const complex = lifft_complex, complex_multiply = lifft_cmul, inverse_fft = lifft_inverse_complex
				const waves = new Proxy(_spectra, COMPLEX_ARRAY_PROXY)
				const waves_x = new Proxy(lifft_complex_arr(_spectra.n), COMPLEX_ARRAY_PROXY)
				const waves_y = new Proxy(lifft_complex_arr(_spectra.n), COMPLEX_ARRAY_PROXY)
				let water_x = lifft_complex_arr(_spectra.n)
				let water_y = lifft_complex_arr(_spectra.n)
				${code}
				return [water_x, water_y]
			`
		)
	}

	const code_area = document.getElementById("fft2-code")
	let func = compile(code_area.value)
	code_area.oninput = (e => {
		const output = document.getElementById("fft2-error")
		try {
			const f = compile(code_area.value)
			f(0, lifft_complex_arr(SPECTRA.n))
			func = f
			output.hidden = true
		} catch(err) {
			console.error(err)
			output.hidden = false
			output.textContent = err
		}
	})
	
	return function(t){
		// Init spectra with SPECTRA*phases.
		const spectra = lifft_complex_arr(SPECTRA.n)
		for(let i = 0; i < SPECTRA.n; i++){
			const w = lifft_complex(Math.cos(phases[i]), Math.sin(phases[i]));
			const p = lifft_cmul(w, lifft_complex(SPECTRA.re[i], SPECTRA.im[i]))
			const j = -i & (SPECTRA.n - 1)
			spectra.re[j] = p.re
			spectra.im[j] = p.im
		}
		
		const [water_x, water_y] = func(4*t, spectra)
		
		const scale = canvas.width/(spectra.n - 1)
		
		ctx.setTransform(canvas.width/spectra.n, 0, 0, -5, 0, canvas.height)
		const {x:mx, y:my} = widget.mlocal
		const mi = Math.floor(Math.max(0, Math.min(mx, SPECTRA.n - 1)))
		const mi_signed = (mi ^ SPECTRA.n/2) - SPECTRA.n/2
		
		if(widget.mleft) SPECTRA.re[-mi & (SPECTRA.n - 1)] = my/(mi == 0 ? 1 : Math.abs(mi_signed))
		if(widget.mright) SPECTRA.re[-mi & (SPECTRA.n - 1)] = 0
		
		for(let i = 0; i < SPECTRA.n; i++){
			const j = -i & (SPECTRA.n - 1)
			ctx.fillStyle = j == mi ? "#0F04" : "#0002"
			const weight = i == 0 ? 1 : (SPECTRA.n/2 - Math.abs(SPECTRA.n/2 - i))
			ctx.fillRect(j, 0, 0.9, weight*SPECTRA.re[i]);
		}
		
		ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		ctx.lineWidth = 3/scale
		ctx.strokeStyle = "#0CF"
		ctx.beginPath()
		for(let i = 0; i < spectra.n; i++) ctx.lineTo(i + water_x.re[i], water_y.re[i])
		ctx.stroke()
		
		ctx.fillStyle = "#0008"
		ctx.textAlign = "center"
		ctx.setTransform(2, 0, 0, 2, 0.5*canvas.width, 0.25*canvas.height)
		ctx.fillText("Left drag to set spectrum. Right drag to clear.", 0, 0)
		
		if(widget.mfocus){
			ctx.setTransform(2, 0, 0, 2, 0.5*canvas.width, 0.75*canvas.height)
			ctx.fillText(`Wavelength: ${(1/mi_signed).toPrecision(2)}, Amplitude: ${SPECTRA.re[mi].toPrecision(1)}`, 0, 0)
		}
	}
})
</script>

## Extending Into Simulation

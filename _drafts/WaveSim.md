---
layout: post
title: "Wave Simulation"
description: "Wave Simulation with FFTs."
date: 2022-12-20
permalink: WaveSim
---

<script src="/js/lifft.js" /></script>

<div id="shadow_projection"></div>
<canvas id="wavies"></canvas>

<script>
(function(){
	const canvas = document.getElementById("wavies")
	canvas.width = 600
	canvas.height = 400
	const ctx = canvas.getContext("2d")
	
	function draw_wave(spectra, tangent, x0, y0, width, height){
		const wave = lifft_inverse_complex(spectra)
		const foo = lifft_inverse_complex(tangent)
		const n = wave.n
		const scale = width/(spectra.n - 1);
		
		ctx.save()
		ctx.setTransform(1, 0, 0, 1, x0, y0 + height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		// Draw Box
		ctx.strokeStyle = "#CCC"
		ctx.lineWidth = 1
		ctx.beginPath()
		ctx.rect(0, -height/2, width, height)
		ctx.stroke()
		ctx.clip()
		
		function draw_wave(style, width, f){
			ctx.strokeStyle = style
			ctx.lineWidth = width
			ctx.beginPath()
			for(let i = 0; i < n; i++) [x, y] = f(i), ctx.lineTo(scale*x, -scale*y)
			ctx.stroke()
		}
		
		// Draw energy
		draw_wave("#0002", 1, i => [i, Math.hypot(wave.re[i], wave.im[i])])
		
		// Draw spokes
		ctx.strokeStyle = "#0002"
		ctx.lineWidth = 1
		for(i = 0; i < n; i++){
			ctx.beginPath()
			ctx.moveTo(scale*i, 0)
			ctx.lineTo(scale*(i - foo.re[i]), -scale*wave.re[i])
			ctx.stroke()
		}
		
		// Draw wave
		draw_wave("#0CF", 3, i => [i - foo.re[i], wave.re[i]])
		
		// Draw dots
		ctx.fillStyle = "#F80"
		for(i = 4; i < n; i += 8){
			ctx.beginPath()
			ctx.arc(scale*(i - foo.re[i]), -scale*wave.re[i] - 5, 3, 0, 2*Math.PI)
			ctx.fill()
		}
		
		ctx.restore()
	}
	
	const wave = lifft_complex_arr(64)
	for(let i = 0; i < wave.n; i++) wave.re[i] = 10/(1 + Math.exp(Math.pow(i - 10, 2)))
	let spectra = lifft_forward_complex(wave)
	
	function add_band(gamma, amplitude){
		for(i = 0; i < spectra.n/2; i++){
			const y = i/gamma
			const phase = lifft_cispi(2*Math.random())
			const mag = amplitude*Math.pow(y, 4)*Math.exp(-y)
			const z = lifft_cmul(phase, lifft_complex(mag, 0))
			spectra.re[i] += z.re
			spectra.im[i] += z.im
		}
	}
	add_band(1, 0.7)
	add_band(2.0, 0.25)
	
	// Limit max energy
	let max_energy = 1.4*spectra.n
	for(let i = 0; i < spectra.n/2; i++){
		const j = -i & (spectra.n - 1)
		const energy_i = Math.hypot(spectra.re[i], spectra.im[i])
		const energy_j = Math.hypot(spectra.re[j], spectra.im[j])
		const energy = (energy_i + energy_j)*i
		if(energy > max_energy){
			const coef = max_energy/energy
			spectra.re[i] *= coef, spectra.im[i] *= coef
			spectra.re[j] *= coef, spectra.im[j] *= coef
			max_energy = 0
		} else {
			max_energy -= energy
		}
	}
	
	function update_spectra(spectra, dt){
		const n = spectra.n
		const speed = dt, damping = -1e-3*dt
		
		const tangent = lifft_complex_arr(n, spectra.type)
		for(let i = 0; i <= n/2; i++){
			const mag = Math.exp(damping*i*i)
			let w = lifft_cispi(Math.sqrt(i)*speed)
			w.re *= mag; w.im *= mag
			
			const p = lifft_cmul(lifft_complex(spectra.re[i], spectra.im[i]), w)
			spectra.re[i] = +p.re, spectra.im[i] = +p.im
			tangent.re[i] = +p.im, tangent.im[i] = -p.re
			
			const j = -i & (n - 1)
			const q = lifft_cmul(lifft_complex(spectra.re[j], spectra.im[j]), w)
			spectra.re[j] = +q.re, spectra.im[j] = +q.im
			tangent.re[j] = -q.im, tangent.im[j] = +q.re
		}
		
		return tangent
	}
	
	let t0 = 0
	function draw(t){
		const dt = t - t0
		t0 = t
		
		ctx.fillStyle = "#EEE"
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		
		const pad = 10
		const tangent = update_spectra(spectra, dt)
		draw_wave(spectra, tangent, pad, 50, canvas.width - 2*pad, 100, 10)
		
		// if(!focused){
		// 	ctx.setTransform(3, 0, 0, 3, 300, 50)
		// 	ctx.fillStyle = "#000"
		// 	ctx.textAlign = "center"
		// 	ctx.fillText("Use Mouse to Interact", 0, 0)
		// }
	}
	
	function animate(ms){
		draw(1e-3*ms)
		window.requestAnimationFrame(animate)
	}
	animate(0)
	// draw({x:0, y:0})
	// canvas.onmousemove = (e) => draw({x:e.offsetX, y:e.offsetY})
})()
</script>

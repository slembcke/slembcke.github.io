---
layout: post
title: "Wave Simulation"
description: "Wave Simulation with FFTs."
date: 2022-12-20
permalink: WaveSim
---

<script src="js/lifft.js" /></script>

<div id="shadow_projection"></div>
<canvas id="wavies" style="border:solid 1px #0002;"></canvas>

<script>
(function(){
	const canvas = document.getElementById("wavies")
	canvas.width = canvas.parentElement.clientWidth
	canvas.height = canvas.width/4
	const ctx = canvas.getContext("2d")
	
	const wave = lifft_complex_arr(64)
	// for(let i = 0; i < wave.n; i++) wave.re[i] = 20/(1 + Math.exp(Math.pow(i - 10, 2)))
	let spectra = lifft_forward_complex(wave)
	
	// function add_band(gamma, amplitude){
	// 	for(i = 0; i < spectra.n/2; i++){
	// 		const y = i/gamma
	// 		const phase = lifft_cispi(2*Math.random())
	// 		const mag = amplitude*Math.pow(y, 4)*Math.exp(-y)
	// 		const z = lifft_cmul(phase, lifft_complex(mag, 0))
	// 		spectra.re[i] += z.re
	// 		spectra.im[i] += z.im
	// 	}
	// }
	// add_band(1, 0.7)
	// add_band(2.0, 0.25)
	
	function update_spectra(spectra, rate, damping, dt){
		rate *= -dt
		damping *= -dt
		
		const n = spectra.n
		let max_energy = 1.4*n
		spectra.re[0] = spectra.im[0] = 0
		
		const tangent = lifft_complex_arr(n, spectra.type)
		for(let i = 0; i <= n/2; i++){
			const phase = rate*Math.sqrt(i)*Math.PI, mag = Math.exp(damping*i)
			const w = lifft_complex(mag*Math.cos(phase), mag*Math.sin(phase));
			
			p = lifft_cmul(w, lifft_complex(spectra.re[i], spectra.im[i]))
			spectra.re[i] = +p.re, spectra.im[i] = +p.im
			tangent.re[i] = +p.im, tangent.im[i] = -p.re
			
			const j = -i & (n - 1)
			q = lifft_cmul(w, lifft_complex(spectra.re[j], spectra.im[j]))
			spectra.re[j] = +q.re, spectra.im[j] = +q.im
			tangent.re[j] = -q.im, tangent.im[j] = +q.re
		}
		
		return tangent
	}
	
	let mpos = {x: 0, y: 0}
	let mprev = {x: 0, y: 0}
	const mradius = 20
	
	let t0 = 0
	function draw(t){
		const dt = t - t0 + Number.MIN_VALUE
		const mvel = {x:(mpos.x - mprev.x)/dt, y:(mpos.y - mprev.y)/dt};
		mprev = mpos; t0 = t
		
		if(0 < mpos.x && mpos.x < canvas.width){
			const wave = lifft_inverse_complex(spectra)
			
			const scale = wave.n/canvas.width
			const mx = mpos.x*scale
			const my = canvas.height/2 - mpos.y - wave.re[Math.floor(mx)]/scale
			
			const mag = Math.min(Math.max(0, 1 - my/mradius), Math.exp(0.5*my/mradius))
			const width = Math.max(-1.5*my/mradius, 1.5)
			for(let i = 0; i < wave.n; i++){
				const dx = mx - i - 0.5, center = dx/width
				const denom = -width*(1 + Math.exp(center*center))
				
				const damp = 1 - Math.exp(0.3*mag/denom)
				wave.im[i] -= ((dx*mvel.x + mvel.y)/wave.n + wave.im[i])*damp
			}
			spectra = lifft_forward_complex(wave)
		}
		
		const n = spectra.n
		const tangent = update_spectra(spectra, 1, 2e-2, dt)
		const wave_x = lifft_inverse_complex(tangent)
		const wave_y = lifft_inverse_complex(spectra)
		const scale = canvas.width/(spectra.n - 1);
		
		ctx.save()
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		
		ctx.setTransform(1, 0, 0, 1, 0, canvas.height/2)
		ctx.lineCap = ctx.lineJoin = "round"
		
		function draw_wave(style, line_width, f){
			ctx.strokeStyle = style
			ctx.lineWidth = line_width
			ctx.beginPath()
			for(let i = 0; i < n; i++) [x, y] = f(i), ctx.lineTo(scale*x, -scale*y)
			ctx.stroke()
		}
		
		// Draw wave energy
		draw_wave("#0002", 1, i => [i, Math.hypot(wave_y.re[i], wave_y.im[i])])
		
		const g_scale = 0.25
		
		// // Draw spokes
		// ctx.strokeStyle = "#0002"
		// ctx.lineWidth = 1
		// for(i = 0; i < n; i++){
		// 	ctx.beginPath()
		// 	ctx.moveTo(scale*i, 0)
		// 	ctx.lineTo(scale*(i - g_scale*wave_x.re[i]), -scale*wave_y.re[i])
		// 	ctx.stroke()
		// }
		
		// Draw wave
		draw_wave("#0CF", 3, i => [i - g_scale*wave_x.re[i], wave_y.re[i]])
		
		// // Draw dots
		// ctx.fillStyle = "#F80"
		// for(i = 4; i < n; i += 8){
		// 	ctx.beginPath()
		// 	ctx.arc(scale*(i - g_scale*wave_x.re[i]), -scale*wave_y.re[i] - 5, 3, 0, 2*Math.PI)
		// 	ctx.fill()
		// }
		
		// Draw mouse
		ctx.beginPath()
		ctx.arc(mpos.x, mpos.y - canvas.height/2, 20, 0, 2*Math.PI)
		ctx.fillStyle = "#FF0"; ctx.fill()
		ctx.strokeStyle = "#F80"; ctx.stroke()
		
		ctx.restore()
		
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
	
	canvas.onmousemove = (e => mpos = {x: e.offsetX, y: e.offsetY})
	canvas.onmouseenter = (e => mprev = mpos = {x: e.offsetX, y: e.offsetY})
})()
</script>

(grey line is wave energy)

---
layout: post
title: "Water"
description: "Water."
date: 2022-12-20
permalink: Water
---

<script src="/js/lifft.js"></script>

<div id="shadow_projection"></div>
<canvas id="wavies"></canvas>

<script>
(function(){
	const canvas = document.getElementById("wavies")
	canvas.width = 600
	canvas.height = 400
	const ctx = canvas.getContext("2d")
	
	const N = 64
	
	function draw_wave(t, spectra, x0, y0, xs, ys){
		const anim = lifft_complex_arr(N)
		for(i = 0; i < N/2; i++){
			const w = lifft_cispi(Math.sqrt(i)*t*1e-3)
			const p = lifft_cmul(w, lifft_complex(spectra.re[i], spectra.im[i]))
			anim.re[i] = p.re, anim.im[i] = p.im
		}
		let waves = lifft_forward_complex(anim)
		
		ctx.save()
		
		// Draw Box
		ctx.strokeStyle = "#CCC"
		ctx.lineWidth = 1
		ctx.beginPath()
		ctx.rect(x0, y0 - ys, N*xs, 2*ys)
		ctx.stroke()
		ctx.clip()
		
		// Draw energy
		ctx.strokeStyle = "#CCC"
		ctx.lineWidth = 1
		ctx.beginPath()
		for(i = 0; i < waves.re.length; i++){
			ctx.lineTo(x0 + xs*i, y0 + ys*Math.hypot(waves.re[i], waves.im[i]))
		}
		ctx.stroke()
		
		// Draw spokes
		ctx.strokeStyle = "#0002"
		ctx.lineWidth = 1
		for(i = 0; i < waves.re.length; i++){
			ctx.beginPath()
			ctx.moveTo(x0 + xs*i, y0)
			ctx.lineTo(x0 + xs*i - ys*waves.im[i], y0 + ys*waves.re[i])
			ctx.stroke()
		}
		
		// Draw wave
		ctx.strokeStyle = "#0CF"
		ctx.lineWidth = 3
		ctx.beginPath()
		for(i = 0; i < waves.re.length; i++){
			ctx.lineTo(x0 + xs*i - ys*waves.im[i], y0 + ys*waves.re[i])
		}
		ctx.stroke()
		
		// Draw dots
		ctx.fillStyle = "#F80"
		for(i = 4; i < waves.re.length; i += 8){
			ctx.beginPath()
			ctx.arc(x0 + xs*i - ys*waves.im[i], y0 + ys*waves.re[i] - 5, 3, 0, 2*Math.PI)
			ctx.fill()
		}
		ctx.restore()
	}
	
	const lo = lifft_complex_arr(N)
	lo.re[3] = 6
	
	const hi = lifft_complex_arr(N)
	hi.re[4] = 2
	
	const bi = lifft_complex_arr(N)
	bi.re[1] = 6
	bi.re[4] = 2
	
	const bandlimited = lifft_complex_arr(N)
	function add_band(gamma, amplitude){
		for(i = 0; i < N; i++){
			const y = i/gamma
			const phase = lifft_cispi(2*Math.random())
			const mag = amplitude*Math.pow(y, 4)*Math.exp(-y)
			const z = lifft_cmul(phase, lifft_complex(mag, 0))
			bandlimited.re[i] += z.re
			bandlimited.im[i] += z.im
		}
	}
	add_band(0.6, 0.40)
	add_band(2.0, 0.03)
	
	function draw(t){
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.lineCap = ctx.lineJoin = "round"
		
		ctx.fillStyle = "#EEE"
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		
		const pad = 10
		let x0 = pad, xs = (canvas.width - 2*pad)/(N - 1), ys = -40
		draw_wave(t, lo, x0,  50, xs, ys)
		draw_wave(t, hi, x0, 150, xs, ys)
		draw_wave(t, bi, x0, 250, xs, ys)
		draw_wave(t, bandlimited, x0, 350, xs, ys)
		
		// if(!focused){
		// 	ctx.setTransform(3, 0, 0, 3, 300, 50)
		// 	ctx.fillStyle = "#000"
		// 	ctx.textAlign = "center"
		// 	ctx.fillText("Use Mouse to Interact", 0, 0)
		// }
	}
	
	function animate(t){
		draw(t)
		window.requestAnimationFrame(animate)
	}
	animate(0)
	// draw({x:0, y:0})
	// canvas.onmousemove = (e) => draw({x:e.offsetX, y:e.offsetY})
})()
</script>

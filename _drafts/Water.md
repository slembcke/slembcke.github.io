---
layout: post
title: "Water"
description: "Water."
date: 2022-12-20
permalink: Water
---

<script>
_LIFFT_REV6 = [
	0x00, 0x20, 0x10, 0x30, 0x08, 0x28, 0x18, 0x38, 0x04, 0x24, 0x14, 0x34, 0x0C, 0x2C, 0x1C, 0x3C,
	0x02, 0x22, 0x12, 0x32, 0x0A, 0x2A, 0x1A, 0x3A, 0x06, 0x26, 0x16, 0x36, 0x0E, 0x2E, 0x1E, 0x3E,
	0x01, 0x21, 0x11, 0x31, 0x09, 0x29, 0x19, 0x39, 0x05, 0x25, 0x15, 0x35, 0x0D, 0x2D, 0x1D, 0x3D,
	0x03, 0x23, 0x13, 0x33, 0x0B, 0x2B, 0x1B, 0x3B, 0x07, 0x27, 0x17, 0x37, 0x0F, 0x2F, 0x1F, 0x3F,
];

// Reverse bits in an integer of up to 24 bits.
function _lifft_rev_bits24(n, bits){
	let rev = 0;
	rev <<= 6; rev |= _LIFFT_REV6[n & 0x3F]; n >>= 6;
	rev <<= 6; rev |= _LIFFT_REV6[n & 0x3F]; n >>= 6;
	rev <<= 6; rev |= _LIFFT_REV6[n & 0x3F]; n >>= 6;
	rev <<= 6; rev |= _LIFFT_REV6[n & 0x3F]; n >>= 6;
	return rev >> (24 - bits);
}

const lifft_complex = (re, im) => ({re, im});
const lifft_cadd = (x, y) => lifft_complex(x.re + y.re, x.im + y.im);
const lifft_csub = (x, y) => lifft_complex(x.re - y.re, x.im - y.im);
const lifft_cmul = (x, y) => lifft_complex(x.re*y.re - x.im*y.im, x.re*y.im + x.im*y.re);
const lifft_cispi = (x) => lifft_complex(Math.cos(Math.PI*x), Math.sin(Math.PI*x));

function _lifft_process(x){
	const x_re = x.re, x_im = x.im, n = x_re.length
	for(stride = 1; stride < n; stride *= 2){
		const wm = lifft_cispi(-1/stride);
		for(i = 0; i < n; i += 2*stride){
			let w = lifft_complex(1, 0);
			for(j = 0; j < stride; j++){
				const idx0 = i + j, idx1 = idx0 + stride;
				const p = lifft_complex(x_re[idx0], x_im[idx0]);
				const q = lifft_cmul(w, lifft_complex(x_re[idx1], x_im[idx1]));
				x_re[idx0] = p.re + q.re, x_re[idx1] = p.re - q.re;
				x_im[idx0] = p.im + q.im, x_im[idx1] = p.im - q.im;
				w = lifft_cmul(w, wm);
			}
		}
	}
}

function lifft_forward_complex(x_in){
	const n = x_in.re.length, bits = Math.floor(Math.log2(n))
	const x_out = lifft_complex([], [])
	for(i = 0; i < n; i++){
		i_rev = _lifft_rev_bits24(i, bits);
		x_out.re[i_rev] = x_in.re[i];
		x_out.im[i_rev] = x_in.im[i];
	}
	_lifft_process(x_out, n);
	return x_out;
}

function lifft_complex_arr(n, type = Float32Array){
	const s = type.BYTES_PER_ELEMENT, buff = new ArrayBuffer(2*s*n);
	return lifft_complex(new type(buff, 0*n, n), new type(buff, s*n, n));
}
</script>

<div id="shadow_projection"></div>
<canvas id="wavies"></canvas>

<script>
(function(){
	const canvas = document.getElementById("wavies")
	canvas.width = 600
	canvas.height = 400
	const ctx = canvas.getContext("2d")
	
	const N = 128
	
	function draw_wave(t, spectra, x0, y0, xs, ys){
		const anim = lifft_complex_arr(N)
		for(i = 0; i < N; i++){
			let w = lifft_cispi(Math.sqrt(i)*t*1e-3)
			let p = lifft_cmul(w, lifft_complex(spectra.re[i], spectra.im[i]));
			anim.re[i] = p.re, anim.im[i] = p.im;
		}
		let waves = lifft_forward_complex(anim)
		
		ctx.save()
		ctx.strokeStyle = "#CCC"
		ctx.lineWidth = 1
		ctx.beginPath()
		ctx.rect(x0, y0 - ys, N*xs, 2*ys)
		ctx.stroke()
		ctx.clip()
		
		ctx.strokeStyle = "#CCC"
		ctx.lineWidth = 1
		ctx.beginPath()
		for(i = 0; i < waves.re.length; i++){
			ctx.lineTo(x0 + xs*i, y0 + ys*Math.hypot(waves.re[i], waves.im[i]))
		}
		ctx.stroke()
		
		ctx.strokeStyle = "#0CF"
		ctx.lineWidth = 3
		ctx.beginPath()
		for(i = 0; i < waves.re.length; i++){
			ctx.lineTo(x0 + xs*i - ys*waves.im[i], y0 + ys*waves.re[i])
		}
		ctx.stroke()
		
		ctx.fillStyle = "#F80"
		for(i = 0; i < waves.re.length; i += 12){
			ctx.beginPath()
			ctx.arc(x0 + xs*i - ys*waves.im[i], y0 + ys*waves.re[i] - 5, 3, 0, 2*Math.PI)
			ctx.fill()
		}
		ctx.restore()
	}
	
	const lo = lifft_complex_arr(N)
	lo.re[1] = 0.6
	
	const hi = lifft_complex_arr(N)
	hi.re[4] = 0.2
	
	const bi = lifft_complex_arr(N)
	bi.re[1] = 0.6
	bi.re[4] = 0.2
	
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
	add_band(0.6, 0.040)
	add_band(2.0, 0.003)
	
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

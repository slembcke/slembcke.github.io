---
layout: post
title: "Water"
description: "Water."
date: 2022-12-20
permalink: Water
---

<div id="shadow_projection"></div>
<canvas id="shadow-projection"></canvas>

<script>
function _lifft_setup(x){
	let n = x.re.length
	let bits = Math.floor(Math.log2(n));
	// Check size.
	console.assert(n == 1 << bits && bits <= 32, n);
	return bits;
}

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

function _lifft_process(x){
	let x_re = x.re, x_im = x.im;
	let n = x_re.length
	for(stride = 1; stride < n; stride *= 2){
		let phase = -Math.PI/stride;
		let wm_re = Math.cos(phase), wm_im = Math.sin(phase);
		// console.log("wm" + stride + ": " + wm_re + "+" + wm_im + " " + phase)
		for(i = 0; i < n; i += 2*stride){
			let w_re = 1, w_im = 0;
			for(j = 0; j < stride; j++){
				let idx0 = i + j, idx1 = idx0 + stride;
				let p_re = x_re[idx0], p_im = x_im[idx0];
				let q_re = w_re*x_re[idx1] - w_im*x_im[idx1];
				let q_im = w_re*x_im[idx1] + w_im*x_re[idx1];
				x_re[idx0] = p_re + q_re, x_im[idx0] = p_im + q_im;
				x_re[idx1] = p_re + q_re, x_im[idx1] = p_im + q_im;
				w_re = w_re*wm_re - w_im*wm_im, w_im = w_re*wm_im + w_im*wm_re;
			}
		}
	}
}

function lifft_forward_complex(x_in, x_out){
	bits = _lifft_setup(x_in), n = x_in.re.length;
	tmp = {re:[], im:[]};
	
	for(i = 0; i < n; i++){
		i_rev = _lifft_rev_bits24(i, bits);
		tmp.re[i_rev] = x_in.re[i];
		tmp.im[i_rev] = x_in.im[i];
	}
	_lifft_process(tmp, n);
	for(i = 0; i < n; i++){
		x_out.re[i] = tmp.re[i];
		x_out.im[i] = tmp.im[i];
		// console.log(i + ": " + x_out.re[i] + "+" + x_out.im[i])
	}
}

(function(){
	const canvas = document.getElementById("shadow-projection")
	const w = canvas.width = 600
	const h = canvas.height = 400
	ctx = canvas.getContext("2d")
	
	let = x = {
		re:[0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
		im:[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	}, X = {re:[], im:[]}
	lifft_forward_complex(x, X)
	
	function draw(mouse, focused){
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.lineCap = ctx.lineJoin = "round"
		
		ctx.fillStyle = "#EEE"
		if(focused) ctx.clearRect(0, 0, w, h); else ctx.fillRect(0, 0, w, h)

		ctx.strokeStyle = "#000"
		ctx.lineWidth = 1.0
		ctx.beginPath()
		
		let x0 = 100, y0 = 100, xs = 10, ys = -10
		ctx.moveTo(x0, y0 + ys*X.re[0])
		for(i = 1; i < x.re.length; i++){
			ctx.lineTo(x0 + xs*i, y0 + ys*X.re[i])
		}
		ctx.stroke()
		
		// if(!focused){
		// 	ctx.setTransform(3, 0, 0, 3, 300, 50)
		// 	ctx.fillStyle = "#000"
		// 	ctx.textAlign = "center"
		// 	ctx.fillText("Use Mouse to Interact", 0, 0)
		// }
	}
	
	draw({x:0, y:0})
	canvas.onmousemove = (e) => draw({x:e.offsetX, y:e.offsetY})
})()
</script>

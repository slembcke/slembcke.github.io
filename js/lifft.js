const lifft_complex = (re, im) => ({re, im});
function lifft_complex_arr(n, type = Float32Array){
	const element_size = type.BYTES_PER_ELEMENT, buff = new ArrayBuffer(2*element_size*n);
	return {re: new type(buff, 0*n, n), im: new type(buff, element_size*n, n), n, type};
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

// Normalize the input array and bit reverse the indexes.
function _lifft_setup(x){
	const result = lifft_complex_arr(x.n, x.type);
	const bits = Math.floor(Math.log2(result.n)), norm = 1/Math.sqrt(result.n)
	for(let i = 0; i < result.n; i++){
		i_rev = _lifft_rev_bits24(i, bits);
		result.re[i_rev] = x.re[i]*norm;
		result.im[i_rev] = x.im[i]*norm;
	}
	return result;
}

const lifft_cadd = ((x, y) => lifft_complex(x.re + y.re, x.im + y.im));
const lifft_csub = ((x, y) => lifft_complex(x.re - y.re, x.im - y.im));
const lifft_cmul = ((x, y) => lifft_complex(x.re*y.re - x.im*y.im, x.re*y.im + x.im*y.re));
const lifft_cabs = (x => Math.hypot(x.re, x.im));
const lifft_cispi = (x => lifft_complex(Math.cos(Math.PI*x), Math.sin(Math.PI*x)));

function _lifft_process(re, im, n){
	for(let stride = 1; stride < n; stride *= 2){
		const wm = lifft_cispi(-1/stride);
		for(let i = 0; i < n; i += 2*stride){
			let w = lifft_complex(1, 0);
			for(let j = 0; j < stride; j++){
				const idx0 = i + j, idx1 = idx0 + stride;
				const p = lifft_complex(re[idx0], im[idx0]);
				const q = lifft_cmul(w, lifft_complex(re[idx1], im[idx1]));
				re[idx0] = p.re + q.re, re[idx1] = p.re - q.re;
				im[idx0] = p.im + q.im, im[idx1] = p.im - q.im;
				w = lifft_cmul(w, wm);
			}
		}
	}
}

function lifft_forward_complex(x){
	const result = _lifft_setup(x);
	_lifft_process(result.re, result.im, result.n);
	return result;
}

function lifft_inverse_complex(x){
	const result = _lifft_setup(x);
	_lifft_process(result.im, result.re, result.n);
	return result;
}

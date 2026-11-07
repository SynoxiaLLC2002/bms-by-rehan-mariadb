/**
 * BMS Block Extractor — front-end capture.
 *
 * Runs inside the preview iframe on the real front end, so the real cascade is in
 * effect. Talks to the admin screen over postMessage:
 *
 *   -> { type: 'bms:ready', tree }            once the page has loaded
 *   <- { type: 'bms:highlight', uid }         outline + scroll a block into view
 *   <- { type: 'bms:capture', uid, label }    extract, replies with bms:bundle
 *   -> { type: 'bms:bundle', uid, label, data }
 */
( function () {
	'use strict';

	/* ── Which computed properties are worth recording ──────────────────── */

	var PROPS = [
		'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear', 'visibility',
		'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'aspect-ratio', 'box-sizing',
		'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
		'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
		'overflow-x', 'overflow-y',
		'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'align-self',
		'flex-grow', 'flex-shrink', 'flex-basis', 'order', 'row-gap', 'column-gap',
		'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow',
		'grid-auto-columns', 'grid-auto-rows', 'grid-column', 'grid-row', 'place-items', 'place-content',
		'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
		'text-transform', 'text-align', 'text-decoration-line', 'text-decoration-color', 'white-space',
		'word-break', 'overflow-wrap', 'text-overflow', 'text-indent', 'vertical-align', 'writing-mode', 'direction',
		'color', 'background-color', 'background-image', 'background-size', 'background-position',
		'background-repeat', 'background-attachment', 'background-clip', 'background-origin',
		'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
		'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
		'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
		'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
		'box-shadow', 'text-shadow', 'opacity', 'mix-blend-mode', 'filter', 'backdrop-filter',
		'transform', 'transform-origin', 'transition', 'animation', 'will-change',
		'cursor', 'pointer-events', 'list-style-type', 'list-style-position',
		'object-fit', 'object-position', 'isolation'
	];

	var MAX_COMPUTED_NODES = 120;
	var MAX_MARKUP_BYTES = 400000;

	/* ── Small helpers ──────────────────────────────────────────────────── */

	function map() { return window.BMS_BE_MAP || {}; }
	function page() { return window.BMS_BE_PAGE || {}; }

	function post( msg ) {
		try { window.parent.postMessage( msg, window.location.origin ); } catch ( e ) {}
	}

	function toArray( list ) { return Array.prototype.slice.call( list ); }

	/** Index path from root, e.g. "0/2/1". Stable across the three breakpoint passes. */
	function pathOf( el, root ) {
		var parts = [];
		var n = el;
		while ( n && n !== root && n.parentElement ) {
			parts.unshift( Array.prototype.indexOf.call( n.parentElement.children, n ) );
			n = n.parentElement;
		}
		return parts.join( '/' );
	}

	function textPreview( el ) {
		var t = ( el.textContent || '' ).replace( /\s+/g, ' ' ).trim();
		return t.length > 80 ? t.slice( 0, 80 ) + '…' : t;
	}

	/* ── Block tree, rebuilt from DOM nesting ───────────────────────────── */

	function buildTree() {
		var m = map();
		var els = toArray( document.querySelectorAll( '[data-bms-uid]' ) );
		var byUid = {};

		els.forEach( function ( el ) {
			var uid = el.getAttribute( 'data-bms-uid' );
			var meta = m[ uid ] || {};
			var rect = el.getBoundingClientRect();
			byUid[ uid ] = {
				el: el,
				node: {
					uid: uid,
					name: meta.name || '(unknown)',
					tag: el.tagName.toLowerCase(),
					classes: ( el.getAttribute( 'class' ) || '' ).split( /\s+/ ).filter( Boolean ).slice( 0, 6 ),
					text: textPreview( el ),
					width: Math.round( rect.width ),
					height: Math.round( rect.height ),
					children: []
				}
			};
		} );

		var roots = [];
		els.forEach( function ( el ) {
			var uid = el.getAttribute( 'data-bms-uid' );
			var parentEl = el.parentElement ? el.parentElement.closest( '[data-bms-uid]' ) : null;
			var parentUid = parentEl ? parentEl.getAttribute( 'data-bms-uid' ) : null;
			if ( parentUid && byUid[ parentUid ] ) {
				byUid[ parentUid ].node.children.push( byUid[ uid ].node );
			} else {
				roots.push( byUid[ uid ].node );
			}
		} );

		// Blocks whose output had no taggable element still deserve a mention.
		var untagged = Object.keys( m )
			.filter( function ( uid ) { return m[ uid ].untagged; } )
			.map( function ( uid ) { return { uid: uid, name: m[ uid ].name }; } );

		return { roots: roots, untagged: untagged, page: page(), count: els.length };
	}

	/* ── Selector plumbing ──────────────────────────────────────────────── */

	/** Split a selector list on top-level commas only — :is(a, b) must survive. */
	function splitSelectors( sel ) {
		var out = [];
		var cur = '';
		var depth = 0;
		var quote = null;
		for ( var i = 0; i < sel.length; i++ ) {
			var c = sel.charAt( i );
			if ( quote ) {
				cur += c;
				if ( c === quote && sel.charAt( i - 1 ) !== '\\' ) { quote = null; }
				continue;
			}
			if ( c === '"' || c === "'" ) { quote = c; cur += c; continue; }
			if ( c === '(' || c === '[' ) { depth++; cur += c; continue; }
			if ( c === ')' || c === ']' ) { depth--; cur += c; continue; }
			if ( c === ',' && depth === 0 ) { out.push( cur ); cur = ''; continue; }
			cur += c;
		}
		out.push( cur );
		return out.map( function ( s ) { return s.trim(); } ).filter( Boolean );
	}

	var PSEUDO_EL = /::?(before|after|first-line|first-letter|selection|placeholder|marker|backdrop|file-selector-button|part|slotted)\b(\([^)]*\))?/gi;
	var PSEUDO_STATE = /:(hover|focus|focus-within|focus-visible|active|visited|link|any-link|target|checked|indeterminate|default|disabled|enabled|required|optional|valid|invalid|in-range|out-of-range|read-only|read-write|placeholder-shown|autofill|user-invalid|open|popover-open|-webkit-[a-z-]+|-moz-[a-z-]+)\b(\([^)]*\))?/gi;

	/** matches() rejects pseudo-elements and cannot evaluate states — strip them, keep structure. */
	function testable( sel ) {
		var s = sel.replace( PSEUDO_EL, '' ).replace( PSEUDO_STATE, '' ).trim();
		if ( ! s ) { return null; }
		if ( /^[>+~]/.test( s ) || /[>+~]$/.test( s ) ) { return null; }
		return s;
	}

	function anyMatch( sel, nodes ) {
		if ( ! sel ) { return false; }
		var parts = splitSelectors( sel );
		for ( var i = 0; i < parts.length; i++ ) {
			var t = testable( parts[ i ] );
			if ( ! t ) { continue; }
			for ( var j = 0; j < nodes.length; j++ ) {
				try {
					if ( nodes[ j ].matches( t ) ) { return true; }
				} catch ( e ) {
					break; // unsupported selector syntax — give up on this part only
				}
			}
		}
		return false;
	}

	function joinCond( a, b ) {
		if ( ! a ) { return b || ''; }
		if ( ! b ) { return a; }
		return a + ' and ' + b;
	}

	/* ── CSS collection ─────────────────────────────────────────────────── */

	/**
	 * Walk every reachable stylesheet and keep the rules whose selectors match
	 * something inside the block (scope "block") or one of its ancestors (scope
	 * "context" — inherited font, container max-width, theme custom properties).
	 * Rules nested in @media/@supports/@container keep their condition and are
	 * kept regardless of the current viewport, so one pass captures every breakpoint.
	 */
	function collectCss( root ) {
		var inside = [ root ].concat( toArray( root.querySelectorAll( '*' ) ) );
		var ancestors = [];
		var a = root.parentElement;
		while ( a ) { ancestors.push( a ); a = a.parentElement; }

		var rules = [];
		var fontFaces = [];
		var keyframes = {};
		var externalSheets = [];
		var seen = {};

		function pushRule( rule, ctx, href, scope ) {
			var key = ( ctx.media || '' ) + '|' + ( ctx.supports || '' ) + '|' + ( ctx.container || '' ) + '|' + rule.cssText;
			if ( seen[ key ] ) { return; }
			seen[ key ] = true;
			rules.push( {
				selector: rule.selectorText,
				css: rule.cssText,
				media: ctx.media || '',
				supports: ctx.supports || '',
				container: ctx.container || '',
				layer: ctx.layer || '',
				scope: scope,
				sheet: href || '(inline)'
			} );
		}

		function walk( ruleList, ctx, href ) {
			if ( ! ruleList ) { return; }
			for ( var i = 0; i < ruleList.length; i++ ) {
				var rule = ruleList[ i ];
				try {
					if ( rule.type === 1 || rule.selectorText !== undefined ) { // CSSStyleRule
						if ( anyMatch( rule.selectorText, inside ) ) {
							pushRule( rule, ctx, href, 'block' );
						} else if ( anyMatch( rule.selectorText, ancestors ) ) {
							pushRule( rule, ctx, href, 'context' );
						}
						continue;
					}
					if ( rule.type === 5 ) { // @font-face
						fontFaces.push( {
							css: rule.cssText,
							family: rule.style.getPropertyValue( 'font-family' ),
							sheet: href || '(inline)'
						} );
						continue;
					}
					if ( rule.type === 7 ) { // @keyframes
						keyframes[ rule.name ] = rule.cssText;
						continue;
					}
					if ( rule.type === 3 ) { // @import
						if ( rule.styleSheet ) { safeSheet( rule.styleSheet, ctx ); }
						continue;
					}
					if ( rule.cssRules ) { // @media, @supports, @container, @layer, @scope
						var next = { media: ctx.media, supports: ctx.supports, container: ctx.container, layer: ctx.layer };
						if ( rule.type === 4 ) {
							next.media = joinCond( ctx.media, rule.media ? rule.media.mediaText : rule.conditionText );
						} else if ( rule.type === 12 ) {
							next.supports = joinCond( ctx.supports, rule.conditionText );
						} else if ( rule.conditionText ) {
							next.container = joinCond( ctx.container, rule.conditionText );
						} else if ( rule.name !== undefined ) {
							next.layer = rule.name || ctx.layer;
						}
						walk( rule.cssRules, next, href );
					}
				} catch ( e ) { /* one bad rule must not abort the sweep */ }
			}
		}

		function safeSheet( sheet, ctx ) {
			var href = sheet.href || '';
			if ( sheet.disabled ) { return; }
			var list = null;
			try {
				list = sheet.cssRules;
			} catch ( e ) {
				externalSheets.push( { href: href, reason: 'cross-origin, rules unreadable' } );
				return;
			}
			var base = ctx;
			if ( ! base ) {
				var mt = sheet.media && sheet.media.mediaText ? sheet.media.mediaText : '';
				base = { media: mt === 'all' ? '' : mt, supports: '', container: '', layer: '' };
			}
			walk( list, base, href );
		}

		for ( var s = 0; s < document.styleSheets.length; s++ ) {
			safeSheet( document.styleSheets[ s ], null );
		}

		// Keep only the @font-face and @keyframes actually referenced.
		var blob = rules.map( function ( r ) { return r.css; } ).join( ' ' );
		var usedFamilies = {};
		inside.slice( 0, 400 ).forEach( function ( el ) {
			var cs = getComputedStyle( el );
			cs.getPropertyValue( 'font-family' ).split( ',' ).forEach( function ( f ) {
				usedFamilies[ f.trim().replace( /^["']|["']$/g, '' ).toLowerCase() ] = true;
			} );
			var anim = cs.getPropertyValue( 'animation-name' );
			if ( anim && anim !== 'none' ) { blob += ' ' + anim; }
		} );

		fontFaces = fontFaces.filter( function ( f ) {
			var fam = ( f.family || '' ).replace( /^["']|["']$/g, '' ).toLowerCase();
			return !! usedFamilies[ fam ] || blob.toLowerCase().indexOf( fam ) !== -1;
		} );

		var usedKeyframes = Object.keys( keyframes ).filter( function ( n ) {
			return new RegExp( '\\b' + n.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) + '\\b' ).test( blob );
		} ).map( function ( n ) {
			return { name: n, css: keyframes[ n ] };
		} );

		return { rules: rules, fontFaces: fontFaces, keyframes: usedKeyframes, externalSheets: externalSheets };
	}

	/** Custom properties resolved on the block root — themes hide half their design system here. */
	function collectVariables( root ) {
		var out = {};
		var cs = getComputedStyle( root );
		for ( var i = 0; i < cs.length; i++ ) {
			var prop = cs.item( i );
			if ( prop.slice( 0, 2 ) === '--' ) {
				out[ prop ] = cs.getPropertyValue( prop ).trim();
			}
		}
		return out;
	}

	/* ── Computed styles, minus the user-agent noise ────────────────────── */

	var defaultsFrame = null;
	var defaultsCache = {};

	function defaultsFor( tag ) {
		if ( defaultsCache[ tag ] ) { return defaultsCache[ tag ]; }
		try {
			if ( ! defaultsFrame ) {
				defaultsFrame = document.createElement( 'iframe' );
				defaultsFrame.setAttribute( 'aria-hidden', 'true' );
				defaultsFrame.style.cssText = 'position:absolute;width:1200px;height:10px;left:-99999px;top:0;border:0;visibility:hidden';
				document.body.appendChild( defaultsFrame );
			}
			var doc = defaultsFrame.contentDocument;
			var probe = doc.createElement( tag );
			doc.body.appendChild( probe );
			var cs = defaultsFrame.contentWindow.getComputedStyle( probe );
			var rec = {};
			PROPS.forEach( function ( p ) { rec[ p ] = cs.getPropertyValue( p ); } );
			doc.body.removeChild( probe );
			defaultsCache[ tag ] = rec;
			return rec;
		} catch ( e ) {
			defaultsCache[ tag ] = {};
			return defaultsCache[ tag ];
		}
	}

	function snapshotComputed( root ) {
		var all = [ root ].concat( toArray( root.querySelectorAll( '*' ) ) );
		var truncated = all.length > MAX_COMPUTED_NODES;
		var els = all.slice( 0, MAX_COMPUTED_NODES );

		var nodes = els.map( function ( el ) {
			var cs = getComputedStyle( el );
			var tag = el.tagName.toLowerCase();
			var def = defaultsFor( tag );
			var styles = {};
			PROPS.forEach( function ( p ) {
				var v = cs.getPropertyValue( p );
				if ( ! v ) { return; }
				if ( def[ p ] === v ) { return; } // identical to the UA default — noise
				styles[ p ] = v;
			} );
			var r = el.getBoundingClientRect();
			return {
				path: pathOf( el, root ),
				tag: tag,
				id: el.id || '',
				classes: el.getAttribute( 'class' ) || '',
				blockUid: el.getAttribute( 'data-bms-uid' ) || '',
				rect: { w: Math.round( r.width * 100 ) / 100, h: Math.round( r.height * 100 ) / 100 },
				styles: styles
			};
		} );

		return { nodes: nodes, truncated: truncated, totalNodes: all.length };
	}

	/* ── Assets ─────────────────────────────────────────────────────────── */

	function urlsIn( text ) {
		var out = [];
		var re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
		var m;
		while ( ( m = re.exec( text ) ) !== null ) { out.push( m[ 2 ] ); }
		return out;
	}

	function collectAssets( root, css ) {
		var images = {};
		var backgrounds = {};
		var fonts = {};
		var media = {};

		toArray( root.querySelectorAll( 'img' ) ).forEach( function ( img ) {
			var src = img.currentSrc || img.src;
			if ( ! src ) { return; }
			var r = img.getBoundingClientRect();
			images[ src ] = {
				url: src,
				srcset: img.getAttribute( 'srcset' ) || '',
				sizes: img.getAttribute( 'sizes' ) || '',
				alt: img.getAttribute( 'alt' ) || '',
				natural: img.naturalWidth + 'x' + img.naturalHeight,
				rendered: Math.round( r.width ) + 'x' + Math.round( r.height ),
				loading: img.getAttribute( 'loading' ) || ''
			};
		} );

		toArray( root.querySelectorAll( 'video, source, iframe' ) ).forEach( function ( v ) {
			var src = v.getAttribute( 'src' ) || v.getAttribute( 'poster' );
			if ( src ) {
				media[ src ] = { url: src, tag: v.tagName.toLowerCase(), type: v.getAttribute( 'type' ) || '' };
			}
		} );

		[ root ].concat( toArray( root.querySelectorAll( '*' ) ) ).slice( 0, 400 ).forEach( function ( el ) {
			var bg = getComputedStyle( el ).getPropertyValue( 'background-image' );
			if ( ! bg || bg === 'none' ) { return; }
			urlsIn( bg ).forEach( function ( url ) {
				if ( url.slice( 0, 5 ) !== 'data:' ) {
					backgrounds[ url ] = { url: url, on: pathOf( el, root ) || '(root)' };
				}
			} );
		} );

		css.fontFaces.forEach( function ( f ) {
			urlsIn( f.css ).forEach( function ( url ) {
				fonts[ url ] = { url: url, family: ( f.family || '' ).replace( /^["']|["']$/g, '' ) };
			} );
		} );

		function values( o ) { return Object.keys( o ).map( function ( k ) { return o[ k ]; } ); }

		return {
			images: values( images ),
			backgrounds: values( backgrounds ),
			fonts: values( fonts ),
			media: values( media ),
			inlineSvgCount: root.querySelectorAll( 'svg' ).length,
			externalSheets: css.externalSheets
		};
	}

	/* ── Interactivity signals ──────────────────────────────────────────── */

	function collectScripts( root ) {
		var pageScripts = toArray( document.querySelectorAll( 'script[src]' ) ).map( function ( s ) {
			return { id: s.id || '', src: s.src, defer: !! s.defer, async: !! s.async, module: s.type === 'module' };
		} );

		// Data attributes, ARIA and roles are the honest signal of what a block does.
		var attrs = [];
		[ root ].concat( toArray( root.querySelectorAll( '*' ) ) ).forEach( function ( el ) {
			toArray( el.attributes || [] ).forEach( function ( at ) {
				if ( at.name === 'data-bms-uid' || at.name === 'data-bms-highlight' ) { return; }
				if ( /^(data-|aria-|on)/.test( at.name ) || at.name === 'role' || at.name === 'tabindex' ) {
					attrs.push( {
						path: pathOf( el, root ) || '(root)',
						attr: at.name,
						value: String( at.value ).slice( 0, 200 )
					} );
				}
			} );
		} );

		return { pageScripts: pageScripts, blockAttributes: attrs.slice( 0, 300 ) };
	}

	/* ── Assemble ───────────────────────────────────────────────────────── */

	function extract( uid ) {
		var root = document.querySelector( '[data-bms-uid="' + uid + '"]' );
		if ( ! root ) { return { error: 'Block ' + uid + ' is not present in the rendered page.' }; }

		var meta = map()[ uid ] || {};
		var css = collectCss( root );

		var clone = root.cloneNode( true );
		clone.removeAttribute( 'data-bms-highlight' );
		var markup = clone.outerHTML;

		var innerBlocks = toArray( root.querySelectorAll( '[data-bms-uid]' ) ).map( function ( el ) {
			var u = el.getAttribute( 'data-bms-uid' );
			var m = map()[ u ];
			return m ? { uid: u, name: m.name, attrs: m.attrs } : null;
		} ).filter( Boolean );

		return {
			meta: {
				generatedAt: new Date().toISOString(),
				plugin: 'bms-block-extractor',
				page: page(),
				viewportWidth: window.innerWidth,
				devicePixelRatio: window.devicePixelRatio,
				userAgent: navigator.userAgent
			},
			block: {
				uid: uid,
				name: meta.name || '(unknown)',
				attributes: meta.attrs || {},
				innerBlocks: innerBlocks
			},
			markup: markup.length > MAX_MARKUP_BYTES
				? markup.slice( 0, MAX_MARKUP_BYTES ) + '\n<!-- truncated at ' + MAX_MARKUP_BYTES + ' bytes -->'
				: markup,
			css: css,
			variables: collectVariables( root ),
			computed: snapshotComputed( root ),
			assets: collectAssets( root, css ),
			scripts: collectScripts( root )
		};
	}

	/* ── Highlight ──────────────────────────────────────────────────────── */

	var hlStyle = null;

	function highlight( uid ) {
		if ( ! hlStyle ) {
			hlStyle = document.createElement( 'style' );
			hlStyle.textContent = '[data-bms-highlight]{outline:3px solid #2271b1 !important;outline-offset:2px !important;}';
			document.head.appendChild( hlStyle );
		}
		toArray( document.querySelectorAll( '[data-bms-highlight]' ) ).forEach( function ( el ) {
			el.removeAttribute( 'data-bms-highlight' );
		} );
		var el = document.querySelector( '[data-bms-uid="' + uid + '"]' );
		if ( el ) {
			el.setAttribute( 'data-bms-highlight', '1' );
			el.scrollIntoView( { block: 'center', behavior: 'smooth' } );
		}
	}

	/* ── Wiring ─────────────────────────────────────────────────────────── */

	window.addEventListener( 'message', function ( ev ) {
		if ( ev.origin !== window.location.origin ) { return; }
		var d = ev.data;
		if ( ! d || typeof d !== 'object' ) { return; }

		if ( d.type === 'bms:highlight' ) {
			highlight( d.uid );
		} else if ( d.type === 'bms:tree' ) {
			post( { type: 'bms:ready', tree: buildTree() } );
		} else if ( d.type === 'bms:capture' ) {
			var data;
			try {
				data = extract( d.uid );
			} catch ( e ) {
				data = { error: String( ( e && e.stack ) || e ) };
			}
			post( { type: 'bms:bundle', uid: d.uid, label: d.label, data: data } );
		}
	} );

	function announce() { post( { type: 'bms:ready', tree: buildTree() } ); }

	if ( document.readyState === 'complete' ) {
		setTimeout( announce, 0 );
	} else {
		window.addEventListener( 'load', function () { setTimeout( announce, 150 ); } );
	}
}() );

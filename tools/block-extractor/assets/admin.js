/**
 * BMS Block Extractor — admin screen.
 *
 * Drives the preview iframe: renders the block tree it reports, then captures the
 * selected block once per breakpoint. The iframe is given a real CSS width so media
 * queries evaluate correctly, and scaled down visually with a transform — transforms
 * do not affect layout, so the measurements inside stay honest.
 */
( function () {
	'use strict';

	var cfg = window.BMS_BE || {};
	var BREAKPOINTS = [
		{ key: 'desktop', label: 'Desktop', width: 1440 },
		{ key: 'tablet', label: 'Tablet', width: 810 },
		{ key: 'mobile', label: 'Mobile', width: 390 }
	];

	var frame, stage, treeBox, statusBox, exportBtn, copyBtn, resultBox;
	var tree = null;
	var selected = null;
	var pending = null;

	function $( sel ) { return document.querySelector( sel ); }

	function status( msg, kind ) {
		statusBox.textContent = msg;
		statusBox.className = 'bms-be-status' + ( kind ? ' is-' + kind : '' );
	}

	function send( msg ) {
		if ( frame && frame.contentWindow ) {
			frame.contentWindow.postMessage( msg, cfg.origin );
		}
	}

	/* ── Iframe sizing ──────────────────────────────────────────────────── */

	function setFrameWidth( width ) {
		var available = stage.clientWidth || 900;
		var scale = Math.min( 1, available / width );
		frame.style.width = width + 'px';
		frame.style.transform = 'scale(' + scale + ')';
		frame.style.transformOrigin = 'top left';
		stage.style.height = Math.round( 720 * scale ) + 'px';
		frame.style.height = '720px';
	}

	/** Give the browser time to reflow and settle lazy images before measuring. */
	function afterReflow( fn ) {
		requestAnimationFrame( function () {
			requestAnimationFrame( function () {
				setTimeout( fn, 450 );
			} );
		} );
	}

	/* ── Tree rendering ─────────────────────────────────────────────────── */

	function shortName( name ) {
		return String( name ).replace( /^core\//, '' ).replace( /^kadence\//, 'kb:' );
	}

	function renderTree() {
		treeBox.innerHTML = '';
		if ( ! tree || ! tree.roots.length ) {
			treeBox.innerHTML = '<p class="bms-be-empty">No blocks reported. Is the page built with the block editor?</p>';
			return;
		}

		var ul = document.createElement( 'ul' );
		ul.className = 'bms-be-tree';

		function renderNode( node, parentEl ) {
			var li = document.createElement( 'li' );
			var btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'bms-be-node';
			btn.dataset.uid = node.uid;

			var name = document.createElement( 'span' );
			name.className = 'bms-be-node-name';
			name.textContent = shortName( node.name );

			var dims = document.createElement( 'span' );
			dims.className = 'bms-be-node-dims';
			dims.textContent = node.width + '×' + node.height;

			btn.appendChild( name );
			btn.appendChild( dims );

			if ( node.text ) {
				var txt = document.createElement( 'span' );
				txt.className = 'bms-be-node-text';
				txt.textContent = node.text;
				btn.appendChild( txt );
			}

			btn.addEventListener( 'click', function () { select( node ); } );
			li.appendChild( btn );

			if ( node.children.length ) {
				var sub = document.createElement( 'ul' );
				node.children.forEach( function ( c ) { renderNode( c, sub ); } );
				li.appendChild( sub );
			}
			parentEl.appendChild( li );
		}

		tree.roots.forEach( function ( n ) { renderNode( n, ul ); } );
		treeBox.appendChild( ul );

		if ( tree.untagged && tree.untagged.length ) {
			var note = document.createElement( 'p' );
			note.className = 'bms-be-empty';
			note.textContent = tree.untagged.length + ' block(s) produced no taggable element and cannot be captured individually: ' +
				tree.untagged.map( function ( u ) { return shortName( u.name ); } ).join( ', ' );
			treeBox.appendChild( note );
		}
	}

	function select( node ) {
		selected = node;
		Array.prototype.forEach.call( treeBox.querySelectorAll( '.bms-be-node' ), function ( b ) {
			b.classList.toggle( 'is-selected', b.dataset.uid === node.uid );
		} );
		send( { type: 'bms:highlight', uid: node.uid } );
		exportBtn.disabled = false;
		copyBtn.disabled = true;
		status( 'Selected ' + shortName( node.name ) + ' — ' + node.width + '×' + node.height + 'px' );
	}

	/* ── Capture run ────────────────────────────────────────────────────── */

	var lastBundle = null;

	function runCapture() {
		if ( ! selected ) { return; }
		exportBtn.disabled = true;
		copyBtn.disabled = true;
		resultBox.innerHTML = '';

		var collected = {};
		var queue = BREAKPOINTS.slice();

		function next() {
			if ( ! queue.length ) { return finish( collected ); }
			var bp = queue.shift();
			status( 'Capturing at ' + bp.label + ' (' + bp.width + 'px)…', 'busy' );
			setFrameWidth( bp.width );
			afterReflow( function () {
				pending = function ( data ) {
					pending = null;
					if ( data.error ) {
						status( 'Capture failed: ' + data.error, 'error' );
						exportBtn.disabled = false;
						queue.length = 0;
						return;
					}
					collected[ bp.key ] = { breakpoint: bp, data: data };
					next();
				};
				send( { type: 'bms:capture', uid: selected.uid, label: bp.key } );
			} );
		}
		next();
	}

	function finish( collected ) {
		setFrameWidth( BREAKPOINTS[ 0 ].width );

		var base = collected.desktop;
		if ( ! base ) {
			status( 'Nothing captured.', 'error' );
			exportBtn.disabled = false;
			return;
		}

		// CSS, markup and attributes are viewport-independent — take them from the
		// desktop pass. Computed styles and rects are per breakpoint.
		var breakpoints = {};
		Object.keys( collected ).forEach( function ( k ) {
			breakpoints[ k ] = {
				width: collected[ k ].breakpoint.width,
				label: collected[ k ].breakpoint.label,
				viewportWidth: collected[ k ].data.meta.viewportWidth,
				computed: collected[ k ].data.computed
			};
		} );

		lastBundle = {
			meta: base.data.meta,
			block: base.data.block,
			markup: base.data.markup,
			css: base.data.css,
			variables: base.data.variables,
			assets: base.data.assets,
			scripts: base.data.scripts,
			breakpoints: breakpoints
		};

		status( 'Captured ' + base.data.css.rules.length + ' CSS rules across ' +
			Object.keys( breakpoints ).length + ' breakpoints. Saving bundle…', 'busy' );

		save( lastBundle );
	}

	function save( bundle ) {
		fetch( cfg.rest + 'bundle', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce },
			body: JSON.stringify( bundle )
		} )
			.then( function ( r ) { return r.json().then( function ( j ) { return { ok: r.ok, body: j }; } ); } )
			.then( function ( res ) {
				exportBtn.disabled = false;
				copyBtn.disabled = false;
				if ( ! res.ok ) {
					status( 'Save failed: ' + ( res.body.message || 'unknown error' ), 'error' );
					return;
				}
				status( 'Bundle ready.', 'ok' );
				renderResult( res.body );
			} )
			.catch( function ( e ) {
				exportBtn.disabled = false;
				copyBtn.disabled = false;
				status( 'Save failed: ' + e.message, 'error' );
			} );
	}

	function renderResult( body ) {
		resultBox.innerHTML = '';

		var h = document.createElement( 'p' );
		h.innerHTML = '<strong>' + escapeHtml( body.slug ) + '</strong> — ' +
			escapeHtml( body.summary.rules ) + ' CSS rules, ' +
			escapeHtml( body.summary.nodes ) + ' nodes, ' +
			escapeHtml( body.summary.size ) + '.';
		resultBox.appendChild( h );

		var a = document.createElement( 'a' );
		a.className = 'button button-primary';
		a.href = body.download;
		a.textContent = body.zipped ? 'Download bundle (.zip)' : 'Download bundle (.json)';
		a.setAttribute( 'download', '' );
		resultBox.appendChild( a );

		if ( body.files && body.files.length ) {
			var ul = document.createElement( 'ul' );
			ul.className = 'bms-be-files';
			body.files.forEach( function ( f ) {
				var li = document.createElement( 'li' );
				li.textContent = f;
				ul.appendChild( li );
			} );
			resultBox.appendChild( ul );
		}
	}

	function escapeHtml( s ) {
		return String( s ).replace( /[&<>"']/g, function ( c ) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ];
		} );
	}

	/* ── Clipboard summary ──────────────────────────────────────────────── */

	/** Same grouping the server writes into styles.css: conditions become nested blocks. */
	function cssText( bundle ) {
		var out = [];
		bundle.css.fontFaces.forEach( function ( f ) { out.push( f.css ); } );
		bundle.css.keyframes.forEach( function ( k ) { out.push( k.css ); } );

		var groups = {};
		var order = [];
		bundle.css.rules.forEach( function ( r ) {
			var conds = [];
			if ( r.supports ) { conds.push( '@supports ' + r.supports ); }
			if ( r.media ) { conds.push( '@media ' + r.media ); }
			if ( r.container ) { conds.push( '@container ' + r.container ); }
			var key = conds.join( '' );
			if ( ! groups[ key ] ) {
				groups[ key ] = { conditions: conds, rules: [] };
				order.push( key );
			}
			groups[ key ].rules.push( r );
		} );

		// Unconditional rules first, then each conditional group in discovery order.
		order.sort( function ( a, b ) {
			if ( a === b ) { return 0; }
			if ( a === '' ) { return -1; }
			if ( b === '' ) { return 1; }
			return 0;
		} );

		order.forEach( function ( key ) {
			var g = groups[ key ];
			var indent = function ( n ) { return new Array( n + 1 ).join( '\t' ); };
			g.conditions.forEach( function ( c, i ) { out.push( indent( i ) + c + ' {' ); } );
			g.rules.forEach( function ( r ) { out.push( indent( g.conditions.length ) + r.css ); } );
			for ( var i = g.conditions.length - 1; i >= 0; i-- ) { out.push( indent( i ) + '}' ); }
		} );

		return out.join( '\n' );
	}

	function copySummary() {
		if ( ! lastBundle ) { return; }
		var b = lastBundle;
		var md = [
			'# Block export: ' + b.block.name,
			'',
			'Source: ' + ( b.meta.page.url || '' ),
			'Captured: ' + b.meta.generatedAt,
			'',
			'## Attributes',
			'```json',
			JSON.stringify( b.block.attributes, null, 2 ),
			'```',
			'',
			'## Inner blocks',
			'```json',
			JSON.stringify( b.block.innerBlocks.map( function ( i ) { return { name: i.name, attrs: i.attrs }; } ), null, 2 ),
			'```',
			'',
			'## Rendered markup',
			'```html',
			b.markup,
			'```',
			'',
			'## Matched CSS',
			'```css',
			cssText( b ),
			'```',
			'',
			'## Measurements by breakpoint',
			'```json',
			JSON.stringify( Object.keys( b.breakpoints ).reduce( function ( acc, k ) {
				acc[ k ] = b.breakpoints[ k ].computed.nodes.slice( 0, 25 ).map( function ( n ) {
					return { path: n.path, tag: n.tag, rect: n.rect, styles: n.styles };
				} );
				return acc;
			}, {} ), null, 2 ),
			'```'
		].join( '\n' );

		navigator.clipboard.writeText( md ).then( function () {
			status( 'Copied ' + Math.round( md.length / 1024 ) + ' KB of Markdown to the clipboard.', 'ok' );
		} ).catch( function () {
			status( 'Clipboard blocked — use the download instead.', 'error' );
		} );
	}

	/* ── Boot ───────────────────────────────────────────────────────────── */

	document.addEventListener( 'DOMContentLoaded', function () {
		frame = $( '#bms-be-frame' );
		stage = $( '#bms-be-stage' );
		treeBox = $( '#bms-be-tree' );
		statusBox = $( '#bms-be-status' );
		exportBtn = $( '#bms-be-export' );
		copyBtn = $( '#bms-be-copy' );
		resultBox = $( '#bms-be-result' );

		if ( ! frame ) { return; }

		setFrameWidth( BREAKPOINTS[ 0 ].width );
		status( 'Loading page…', 'busy' );

		window.addEventListener( 'message', function ( ev ) {
			if ( ev.origin !== cfg.origin ) { return; }
			var d = ev.data;
			if ( ! d || typeof d !== 'object' ) { return; }

			if ( d.type === 'bms:ready' ) {
				tree = d.tree;
				renderTree();
				status( tree.count + ' blocks found. Pick one.' );
				if ( cfg.preselect ) {
					var found = null;
					( function find( nodes ) {
						nodes.forEach( function ( n ) {
							if ( ! found && n.uid === cfg.preselect ) { found = n; }
							find( n.children );
						} );
					} )( tree.roots );
					if ( found ) { select( found ); }
				}
			} else if ( d.type === 'bms:bundle' && pending ) {
				pending( d.data );
			}
		} );

		// A heavy page can finish loading before this listener exists, so ask again.
		var retries = 0;
		var poll = setInterval( function () {
			if ( tree || retries++ > 6 ) { clearInterval( poll ); return; }
			send( { type: 'bms:tree' } );
		}, 1500 );

		exportBtn.addEventListener( 'click', runCapture );
		copyBtn.addEventListener( 'click', copySummary );

		Array.prototype.forEach.call( document.querySelectorAll( '[data-bms-width]' ), function ( btn ) {
			btn.addEventListener( 'click', function () {
				setFrameWidth( parseInt( btn.dataset.bmsWidth, 10 ) );
				Array.prototype.forEach.call( document.querySelectorAll( '[data-bms-width]' ), function ( b ) {
					b.classList.toggle( 'is-active', b === btn );
				} );
			} );
		} );

		window.addEventListener( 'resize', function () {
			setFrameWidth( parseInt( frame.style.width, 10 ) || BREAKPOINTS[ 0 ].width );
		} );
	} );
}() );

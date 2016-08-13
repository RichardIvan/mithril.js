"use strict"

var o = require("../../ospec/ospec")
var callAsync = require("../../test-utils/callAsync")
var pushStateMock = require("../../test-utils/pushStateMock")
var domMock = require("../../test-utils/domMock")

var m = require("../../render/hyperscript")
var coreRenderer = require("../../render/render")
var apiPubSub = require("../../api/pubsub")
var apiRouter = require("../../api/router")

o.spec("route", function() {
	void [{protocol: "http:", hostname: "localhost"}, {protocol: "file:", hostname: "/"}].forEach(function(env) {
		void ["#", "?", "", "#!", "?!", "/foo"].forEach(function(prefix) {
			o.spec("using prefix `" + prefix + "` starting on " + env.protocol + "//" + env.hostname, function() {
				var FRAME_BUDGET = Math.floor(1000 / 60)
				var $window, root, redraw, route

				o.beforeEach(function() {
					$window = {}

					var dom = domMock()
					for (var key in dom) $window[key] = dom[key]

					var loc = pushStateMock(env)
					for (var key in loc) $window[key] = loc[key]

					root = $window.document.body

					redraw = apiPubSub()
					route = apiRouter($window, coreRenderer($window), redraw)
					route.prefix(prefix)
				})

				o("renders into `root`", function(done) {
					$window.location.href = prefix + "/"
					route(root, "/", {
						"/" : {
							view: function() {
								return m("div")
							}
						}
					})

					callAsync(function() {
						o(root.firstChild.nodeName).equals("DIV")
						
						done()
					})
				})

				o("default route doesn't break back button", function(done) {
					$window.location.href = "http://google.com"
					route(root, "/a", {
						"/a" : {
							view: function() {
								return m("div")
							}
						}
					})

					setTimeout(function() {
						o(root.firstChild.nodeName).equals("DIV")
						
						$window.history.back()
						
						o($window.location.pathname).equals("/")
						
						done()
					}, FRAME_BUDGET)
				})

				o("default route does not inherit params", function(done) {
					$window.location.href = "/invalid?foo=bar"
					route(root, "/a", {
						"/a" : {
							oninit: init,
							view: function() {
								return m("div")
							}
						}
					})

					function init(vnode) {
						o(vnode.attrs).deepEquals({})
						
						done()
					}
				})

				o("redraws when render function is executed", function(done) {
					var onupdate = o.spy()
					var oninit = o.spy()

					$window.location.href = prefix + "/"
					route(root, "/", {
						"/" : {
							view: function() {
								return m("div", {
									oninit: oninit,
									onupdate: onupdate
								})
							}
						}
					})

					callAsync(function() {
						o(oninit.callCount).equals(1)

						redraw.publish()

						// Wrapped to give time for the rate-limited redraw to fire
						setTimeout(function() {
							o(onupdate.callCount).equals(1)

							done()
						}, FRAME_BUDGET)
					})
				})

				o("redraws on events", function(done) {
					var onupdate = o.spy()
					var oninit   = o.spy()
					var onclick  = o.spy()
					var e = $window.document.createEvent("MouseEvents")

					e.initEvent("click", true, true)

					$window.location.href = prefix + "/"
					route(root, "/", {
						"/" : {
							view: function() {
								return m("div", {
									oninit: oninit,
									onupdate: onupdate,
									onclick: onclick,
								})
							}
						}
					})

					callAsync(function() {
						root.firstChild.dispatchEvent(e)

						o(oninit.callCount).equals(1)

						o(onclick.callCount).equals(1)
						o(onclick.this).equals(root.firstChild)
						o(onclick.args[0].type).equals("click")
						o(onclick.args[0].target).equals(root.firstChild)

						// Wrapped to give time for the rate-limited redraw to fire
						setTimeout(function() {
							o(onupdate.callCount).equals(1)

							done()
						}, FRAME_BUDGET)
					})
				})

				o("event handlers can skip redraw", function(done) {
					var onupdate = o.spy()
					var oninit   = o.spy()
					var onclick  = o.spy()
					var e = $window.document.createEvent("MouseEvents")

					e.initEvent("click", true, true)

					$window.location.href = prefix + "/"
					route(root, "/", {
						"/" : {
							view: function() {
								return m("div", {
									oninit: oninit,
									onupdate: onupdate,
									onclick: function(e) {
										e.redraw = false
									},
								})
							}
						}
					})

					callAsync(function() {
						root.firstChild.dispatchEvent(e)

						o(oninit.callCount).equals(1)

						// Wrapped to ensure no redraw fired
						setTimeout(function() {
							o(onupdate.callCount).equals(0)

							done()
						}, FRAME_BUDGET)
					})
				})

				o("changes location on route.link", function(done) {
					var e = $window.document.createEvent("MouseEvents")

					e.initEvent("click", true, true)

					$window.location.href = prefix + "/"
					route(root, "/", {
						"/" : {
							view: function() {
								return m("a", {
									href: "/test",
									oncreate: route.link
								})
							}
						},
						"/test" : {
							view : function() {
								return m("div")
							}
						}
					})

					callAsync(function() {
						var slash = prefix[0] === "/" ? "" : "/"

						o($window.location.href).equals(env.protocol + "//" + (env.hostname === "/" ? "" : env.hostname) + slash + (prefix ? prefix + "/" : ""))

						root.firstChild.dispatchEvent(e)

						o($window.location.href).equals(env.protocol + "//" + (env.hostname === "/" ? "" : env.hostname) + slash + (prefix ? prefix + "/" : "") + "test")
						
						done()
					})
				})
				
				o("accepts object as payload", function(done) {
					var resolveCount = 0
					var renderCount = 0
					var Component = {
						view: function() {
							return m("div")
						}
					}
					
					$window.location.href = prefix + "/"
					route(root, "/abc", {
						"/:id" : {
							resolve: function(use, args, path, route) {
								resolveCount++
								
								o(args).deepEquals({id: "abc"})
								o(path).equals("/abc")
								o(route).equals("/:id")
								
								use(Component)
							},
							render: function(vnode) {
								renderCount++
								
								o(vnode.attrs).deepEquals({id: "abc"})
								
								return vnode
							},
						},
					})
					
					setTimeout(function() {
						o(resolveCount).equals(1)
						o(renderCount).equals(1)
						o(root.firstChild.nodeName).equals("DIV")
						
						done()
					}, FRAME_BUDGET)
				})
				
				o("accepts object without `render` method as payload", function(done) {
					var resolveCount = 0
					var Component = {
						view: function() {
							return m("div")
						}
					}
					
					$window.location.href = prefix + "/"
					route(root, "/abc", {
						"/:id" : {
							resolve: function(use, args, path, route) {
								resolveCount++
								
								o(args).deepEquals({id: "abc"})
								o(path).equals("/abc")
								o(route).equals("/:id")
								
								use(Component)
							},
						},
					})
					
					setTimeout(function() {
						o(resolveCount).equals(1)
						
						o(root.firstChild.nodeName).equals("DIV")
						
						done()
					}, FRAME_BUDGET)
				})
				
				o("accepts object without `resolve` method as payload", function(done) {
					var renderCount = 0
					var Component = {
						view: function() {
							return m("div")
						}
					}
					
					$window.location.href = prefix + "/"
					route(root, "/abc", {
						"/:id" : {
							render: function(vnode) {
								renderCount++
								
								o(vnode.attrs).deepEquals({id: "abc"})
								
								return m(Component)
							},
						},
					})
					
					setTimeout(function() {
						o(root.firstChild.nodeName).equals("DIV")
						
						done()
					}, FRAME_BUDGET)
				})

				o("calls resolve and render correct number of times", function(done) {
					var resolveCount = 0
					var renderCount = 0
					var Component = {
						view: function() {
							return m("div")
						}
					}
					
					$window.location.href = prefix + "/"
					route(root, "/", {
						"/" : {
							resolve: function(use) {
								resolveCount++
								use(Component)
							},
							render: function(vnode) {
								renderCount++
								return vnode
							},
						},
					})

					callAsync(function() {
						o(resolveCount).equals(1)
						o(renderCount).equals(1)
						
						redraw.publish()

						setTimeout(function() {
							o(resolveCount).equals(1)
							o(renderCount).equals(2)
							
							done()
						}, FRAME_BUDGET)
					})
				})
			})
		})
	})
})

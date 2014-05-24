(function(root, factory) {

	if (typeof define === 'function' && define.amd) {
		define(['exports', 'underscore', 'jquery', 'backbone'], function(exports, _, $, Backbone){
			root.Butterfly = factory(root, exports, _, $, Backbone);
		});

	} else {
		root.Butterfly = factory(root, {}, root._, (root.jQuery || root.Zepto || root.ender || root.$));
	}

})(this, function(root, Butterfly, _, $, Backbone){

	//underscore template style {{xxx}}
	_.templateSettings = {
	  interpolate: /\{\{(.+?)\}\}/g
	};

	String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
  };

	Date.prototype.format = function(format) //author: meizz
	{
	  var o = {
	    "M+" : this.getMonth()+1, //month
	    "d+" : this.getDate(),    //day
	    "h+" : this.getHours(),   //hour
	    "m+" : this.getMinutes(), //minute
	    "s+" : this.getSeconds(), //second
	    "q+" : Math.floor((this.getMonth()+3)/3),  //quarter
	    "S" : this.getMilliseconds() //millisecond
	  }

	  if(/(y+)/.test(format)) format=format.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));
	  for(var k in o)if(new RegExp("("+ k +")").test(format))
	    format = format.replace(RegExp.$1, RegExp.$1.length==1 ? o[k] : ("00"+ o[k]).substr((""+ o[k]).length));
	  return format;
	}

	//Butterfly start
	Butterfly.VERSION = '1.0';

  Butterfly.log = function(){
  	arguments[0] = new Date().format('h:mm:ss:S') + '[><] ' + arguments[0];
  	console.log.apply(console, arguments);
  }

  // Butterfly.ViewLoader
  // ---------------
  //
	var ViewLoader = Butterfly.ViewLoader = {

		//加载元素
		loadViewByEL : function(el, success, fail){
			//el的绑定类，若没有，默认为最普通的View（框架定义的）
			var elementBinding = (el.getAttribute('data-window') || el.getAttribute('data-view') || '$view').replace('$', 'butterfly/');
			//加载el的绑定类
			require([elementBinding], function(TopViewClass){
				var topView = new TopViewClass({el: el});

				//el子节点的绑定类集合
				var el_view_bindings = el.querySelectorAll('[data-view]');

				var view_names = _.map(el_view_bindings, function(node){ 
					return node.getAttribute('data-view').replace('$', 'butterfly/');
				});

				if (view_names.length == 0) {
					if (success) success(topView);

				} else {
					require(view_names, function(){
						_.each(arguments, function(ViewClass, index){
							var view = new ViewClass({el: el_view_bindings[index]});
							topView.addSubview(view);
						});
						if (success) success(topView);
					}, fail);
				}

			}, fail);

		},//loadViewByEL

		//TODO: 加多一个参数targetEl?
		//view can be either a html node or a string
		loadView : function(view, success, fail){
			var me = this;
			Butterfly.log('loadView: %s', view);
			if (typeof view == 'string' && view.endsWith('html')) {
				require(['text!'+view], function(page){

					var el = document.createElement('div');
					el.innerHTML = (/<html/i.test(page)) ? page.match(/<body[^>]*>([\s\S.]*)<\/body>/i)[0] : page;

					me.loadViewByEL(el.firstElementChild, success, fail);
				}, fail);

			} else if (typeof view == 'string') {
				require([view], function(View){
					success(new View());
				}, fail);

			} else {
				me.loadViewByEL(view ,success, fail);
			}
		}//loadView

	};

  // Butterfly.History
  // ---------------
  //
	_.extend(Backbone.History.prototype, {
		unroute: function(route) {
			this.handlers = _.reject(this.handlers, function(entry){
				return entry.route.toString() == route.toString();
			});
		}
	});

  // extend removal method
	_.extend(Backbone.Router.prototype, {
  	remove: function(){
  		if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.unroute(route);
      }
  	},
  	unroute: function(route){
  		if (!_.isRegExp(route)) route = this._routeToRegExp(route);
  		Backbone.history.unroute(route);
  	}
  });

  // Butterfly.Router
  // ---------------
  //
  var Router = Butterfly.Router = Backbone.Router.extend({
		routes: {
			'*path(?*params)': 'any',
		},
		any: function(path, params){
			Butterfly.log('route: %s ? ', path, params);
			root.butterfly.route(path, params);
		}
	});

  Butterfly.history = Backbone.history;

	Butterfly.navigate = function(fragment, options){
		options = options || {trigger: true};
		Backbone.history.navigate(fragment, options);
	}

  // Butterfly.Application
  // ---------------
  //
	var Application = Butterfly.Application = function(el){
		this.el = el;
	};

	_.extend(Application.prototype, {

		route: function(path, params){
			if (this.window.route) this.window.route(path, params);
		},
	
		//launch application
		fly: function(){
	    // this.scan(document.body);

	    this.scanWindowOnly(function(){
	    	Butterfly.router = new Butterfly.Router();

	    	var pathname = window.location.pathname;
				var rootPath = pathname.substr(0, pathname.lastIndexOf('/'));
				Butterfly.log("start history with root: %s", rootPath);
				Backbone.history.start({pushState: false, root: rootPath});
	    });
		},

		scanWindowOnly: function(success){
			var me = this;

			var mainWindow = document.querySelector('[data-window]');
			if (mainWindow) {
				ViewLoader.loadView(mainWindow, function(view){
					me.window = view;
					success();
				}, function(err){
					console.error("loadView:[%s] fail: %s", el, err);
					throw err;
				});				
			}
		},

		/*搜索所有顶层view绑定*/
		scan: function(el){
			var me = this;
			if (el.getAttribute('data-view')) {
				ViewLoader.loadView(el, function(view){
					me.subviews.push(view);
					if (el.hasAttribute('data-key-window')) {me.keyWindow = view;};
				}, function(err){
					console.error("loadView:[%s] fail: %s", el, err);
					throw err;
				});
			} else {
				for (var i = 0, node; node = el.childNodes[i]; i++) {
					if (node.nodeType === 1) this.scan(node);
	    	}
			}
		}//scan

	});

	Butterfly.ready = function(callback){
    if (/complete|loaded|interactive/.test(document.readyState) && document.body) callback()
    else document.addEventListener('DOMContentLoaded', function(){ callback() }, false)
    return this;
  }

	Butterfly.ready(function(){
		var app = new Butterfly.Application(document.body);
		root.butterfly = app;
		app.fly();
	});

	return Butterfly;
});

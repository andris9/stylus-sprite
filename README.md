Stylus-Sprite
=============

**Stylus-Sprite** is an extension for [Stylus](https://github.com/LearnBoost/stylus) which makes sprite images from Stylus tags. 
Actually it takes a image file, places it to a sprite image and replaces the original
pointer in the CSS file with position coordinates according to the sprite image.

Installation
------------

    npm install stylus-sprite

Dependencies
------------

  * [stylus](https://github.com/LearnBoost/stylus)
  * [node-gd](/andris9/node-gd) - GD bindings for Node.JS. NB! Make sure you have *libgd* installed on yopur system

Install *libgd* on Mac with [homebrew](http://mxcl.github.com/homebrew/)
 
    brew update
    brew install libgd

Install *libgd* on Debian/Ubuntu

    apt-get install libgd2-xpm-dev

I had problems using node-gd on mac but on Debian it worked perfectly

Usage
-----

Consider the following Stylus CSS

    .block-elm
        background: url(sprite.png) no-repeat sprite("star.png");
        width: 25px;
        height: 25px;
        
After running Stylus-Sprite the resulting CSS would be something like

    .block_elm{
        background: url(sprite.png) no-repeat -25px -78px;
        width: 25px;
        height: 25px;
    }

And the image *sprite.png* would have *star.png* placed on position 25x78 px.

CSS API
-------

Function `sprite(filename[, options])` includes the `filename` in the sprite image and replaces `sprite(...)` with the coordinates
of it.

If `options` param is left empty, no special behavior is added.

    background-position: sprite("tag.png");

`options` is a string similar to html *style* param, keys and values separated with colons and key/value pairs with semicolons.

    background-position: sprite("tag.png","height: 120; repeat: x");
    
Possible keys are

  * `width` - width of the image on sprite, defaults to image with
  * `height` - height of the image on sprite, defaults to image height
  * `resize` - if `true` then resizes the image to `width` and `height` , defaults to false
  * `valign` - if `resize` is false and `height` is bigger than image width, place the image to `top`, `middle` or `bottom`, defaults to `top`
  * `align` - if value is `right` then X coordinate value in CSS will be set to `100%`
  * `repeat` - if value is `x` then repeats the image from entire width of the canvas or to `limit-repeat-x` value; if value is `y` then repeats the image from current Y position to `limit-repeat-y` value; default is `no`.
  * `limit-repeat-x` - limit the width of the repeatable area, defaults to 0 (no limit)
  * `limit-repeat-y` - limit the height of the repeatable area, defaults to 300

NB! All numeric values are plain numeric, no measurement units (defaults to pixels). 


JavaScript API
--------------

Creating the sprite consists of two phases - preparation and rendering.

The first step is to define *StylusSprite* object with required params

    var sprite = new StylusSprite({
        image_root: "./images",
        output_file:"sprite.png"
    });

Second step would be hooking to the Stylus parsing phase with *Stylus.define*

    stylus...define('sprite', function(filename, option_val){
            // preparation phase
            return sprite.spritefunc(filename, option_val);
        });

A more sane version would be using bound function 

    sprite.spritefunc.bind(sprite, filename, option_val)
    
but as Stylus checks for function parameters proxying anonymous function is needed.

Finally when Stylus is finished rendering the CSS *sprite.build* must be run with it. 

    sprite.build(rendered_css, function(err, final_css){
        console.log(final_css);
    });

Somewhat complete example:

    var stylus = require("stylus"),
        StylusSprite = require("stylus-sprite")
        sprite = new StylusSprite({output_file:"sprite.png"});
    
    var css = "body.....";
    
    stylus(css).
        set('filename', 'test.css').
        define('sprite', function(filename, option_val){
            // preparation phase
            return sprite.spritefunc(filename, option_val);
        }).
        render(function(err, css){
            if (err) throw err;
            
            // rendering phase
            sprite.build(css, function(err, css){
                if (err) throw err;
                console.log(css);
            });
        });

## Pngcrush

If you have [Pngcrush](http://pmt.sourceforge.net/pngcrush/) installed in your system, you can use it to optimize generated PNG images.

    var sprite = new StylusSprite({
        image_root: "./images",
        output_file:"sprite.png",
        pngcrush: "pngcrush" // path to pngcrush command
    });
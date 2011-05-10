var stylus = require("stylus"),
    StylusSprite = require("../stylus-sprite"),
    fs = require("fs");

var sprite = new StylusSprite({
    image_root:"./images", // will be appended to the image paths from css
    output_file:"out/sprite.png" // output image
});


stylus(fs.readFileSync("test.css").toString("utf-8")).
    set('filename', 'test.css').
    define('sprite', function(filename, option_val){
        return sprite.spritefunc(filename, option_val);
    }).
    render(function(err, css){
        if (err) throw err;
        sprite.build(css, function(err, css){
            if (err) throw err;
            
            fs.writeFileSync("out/sprite.css", css);
            console.log("CSS written to sprite.css");
        });
    });
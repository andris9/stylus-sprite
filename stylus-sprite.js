var stylus = require("stylus"),
    gdlib = require("node-gd"),
    pathlib = require('path'),
    exec = require("child_process").exec,
    fs = require("fs");

module.exports = Sprite;

/**
 * Sprite
 *
 * Updates Stylus CSS and generates a sprite image
 *
 * -Sprite-------------------------------
 * |                                    |
 * |  X--Block------------------------- |
 * |  |                               | |
 * |  | -Img---------- -Img---------- | |
 * |  | | -Imgfile-- | | -Imgfile-- | | |
 * |  | | |        | | | |        | | | |
 * |  | | ---------- | | ---------- | | |
 * |  | -------------- -------------- | |
 * |  --------------------------------- |
 * --------------------------------------
 *
 * "X" marks the position for CSS in pixel values
 *
 **/
function Sprite(options){

    options = options || {};

    this.images = [];
    this.processedImages = [];
    this._img_id = 0;
    this.canvasWidth = 0;
    this.canvasHeight = 0;
    this.padding = 10;

    this.image_root = options.image_root || "";
    this.output_file = options.output_file || "sprite.png";

    this.placeholder = options.placeholder || "SPRITE_PLACEHOLDER";

    this.output_format = this.output_file.split(".").pop().toLowerCase() || "png";
    this.pngcrush = this.output_format=="png" && options.pngcrush || false;

    if(["png", "jpeg", "jpg", "gif"].indexOf(this.output_format)<0){
        throw new Error("Invalid output format '"+this.output_format+"'");
    }
}


/**
 * Sprite#keys -> Object
 *
 * Valid key names and values
 **/
Sprite.prototype.keys = {
    "width":{
        type:"number"
    },
    "height":{
        type:"number"
    },
    "align":{
        type:"predefined",
        values: ["block","left","center","right"]
    },
    "valign":{
        type:"predefined",
        values: ["block","bottom","middle","top"]
    },
    "resize":{
        type: "boolean"
    },
    "repeat":{
        type:"predefined",
        values: ["no","x","y"]
    },
    "limit-repeat-x":{
        type:"number"
    },
    "limit-repeat-y":{
        type:"number"
    },
    "totalwidth":{
        type:"number"
    },
    "totalheight":{
        type:"number"
    },
    "padwidth":{
        type:"number"
    },
    "padheight":{
        type:"number"
    }
};


/**
 * Sprite#defaults -> Object
 *
 * Default values to be used with image blocks
 **/
Sprite.prototype.defaults = {
    width:  0,
    height: 0,
    align:  "block",
    valign: "block",
    resize: false,
    repeat: "no",
    "limit-repeat-y": 300,
    "limit-repeat-x": 0
};


/**
 * Sprite#getDefaults() -> Object
 *
 * Generates a copy of Sprite#defaults
 **/
Sprite.prototype.getDefaults = function(){
    var defaults = {},
        keys = Object.keys(this.defaults);
    for(var i = 0, len = keys.length; i < len; i++){
        defaults[keys[i]] = this.defaults[keys[i]];
    }
    return defaults;
};

/**
 * Sprite#validate(key, value) -> String|Number
 * - key (String): key name
 * - value (String): value for the key
 *
 * Checks if the key is allowed and that the value is formatted accordingly.
 * Returns processed value (eg. string "245" converted to number 245 etc.)
 **/
Sprite.prototype.validate = function(key, value){

    if(!this.keys[key]){
        throw new Error("Invalid key '"+key+"'");
    }

    switch(this.keys[key].type){
        case "number":
            value = Number(value);
            if(isNaN(value)){
                throw new Error("Invalid number value '"+key+"' for "+key);
            }
            break;
        case "predefined":
            if(this.keys[key].values.indexOf(value)<0){
               throw new Error("Unknown value '"+value+"' for "+key+", allowed: "+this.keys[key].values);
            }
            break;
        case "boolean":
            value = value=="false" || value=="0" || !value?false:true;
            break;
    }
    return value;
};

/**
 * Sprite#spritefunc(filename, option_val) -> String
 * - filename (Object): filename for the image
 * - options (Object): options for the image
 *
 * This function is run by Stylus. option_val is parsed and a options object
 * is generated from it.
 *
 *     key1: value1; key2: value2; ...
 *
 * When encountering unknown key or the value is not suitable, an error is thrown.
 * Sprite image positions are replaced with placeholders in the form of
 *
 *     SPRITE_PLACEHOLDER(IMG_ID)
 *
 * When the actual sprite is generated then these placeholders will be replaced
 * with actual positions of the image in the sprite file
 **/

Sprite.prototype.spritefunc = function(filename, options){

    // setup default values
    var imgdata = this.getDefaults();
    imgdata.filename = filename.val;

    // parse option string, split parts by ";"
    (options && options.val || "").split(";").forEach((function(opts){

        // split on ":", find key and value
        var parts = opts.split(":"),
            key = parts[0] && parts.shift().trim().toLowerCase(),
            value = parts.length && parts.join(":").trim();

        // skip empty parts
        if(!key)return;

        // validate key and its value
        imgdata[key] = this.validate(key, value);

    }).bind(this));

    // generate a "hash" for indexing the value by joining sorted keypairs
    // -> a_key=value;b_key=value;c_key=value
    var keys = Object.keys(imgdata), hash = [];
    keys.sort();
    for(var i=0; i<keys.length; i++){
        hash.push(keys[i]+"="+imgdata[keys[i]]);
    }
    imgdata.hash = hash.join(";");

    // check if the imgdata object is already processed (check if hash exists)
    if(!this.images.filter(function(elm){
        if(elm.hash == imgdata.hash){
            imgdata = elm; // use cached value
            return true;
        }
        return false;
    }).length){
        // not yet, generate ID value
        this._img_id++;
        imgdata._img_id = this._img_id;
        this.images.push(imgdata);
        imgdata.lineno = filename.lineno;
    }
    return this.placeholder+"("+imgdata._img_id+")";
};


/**
 * Sprite#build(css, callback, err) -> undefined
 * - css (String): Styuls generated CSS text
 * - callback (Function): callback to be run after images are processed
 * - err (Object): error object
 *
 * Queue manager for image processing. If there's any images left to process,
 * run the processor with callback set as self. If all images are processed,
 * run the sprite generator
 **/
Sprite.prototype.build = function(css, callback, err){

    if(err){
        callback(err);
    }

    if(this.images.length){
        // process all images, one by one
        this.processImage(this.images.shift(), this.build.bind(this, css, callback));
    }else{
        // if there's no images left, generate sprite
        this.makeMap(css, callback);
    }
};


/**
 * Sprite#processImage(imgdata, callback) -> undefined
 * - imgdata (Object): hash containing metadata for the image
 * - callback (Function): callback function to be run
 *
 * Processes individual image file, calculates width and height for the
 * resulting image block etc. This is asynchronous function - when it finishes
 * then it runs the callback function which in turn might run this function again
 * but for another image
 **/
Sprite.prototype.processImage = function(imgdata, callback){
    console.log("processing "+imgdata.filename +" ("+imgdata._img_id+")...");

    // Open Image
    this.openImage(pathlib.join(this.image_root, imgdata.filename), (function(err, img, path){

        if(err){
            if(err.message){
                err.message+="; CSS line nr #"+imgdata.lineno;
            }
            return callback(err);
        }

        // Find actual width of the image
        imgdata.imageWidth = img.width;
        if(!imgdata.width){
            imgdata.width = img.width;
        }

        // Find actual height of the image
        imgdata.imageHeight = img.height;
        if(!imgdata.height){
            imgdata.height = img.height;
        }

        // Calculate block size for the image
        // Use pixel values, or 100% for X axis where needed (repeat:x)
        imgdata.blockWidth = (imgdata.repeat=="x" && imgdata['limit-repeat-x'] || "100%") || (imgdata.align!="block" && "100%") || imgdata.width;
        imgdata.blockHeight = (imgdata.repeat=="y" && imgdata['limit-repeat-y']) || imgdata.height;

        // Block height can't be lower than image height
        if(imgdata.blockHeight<imgdata.height){
            imgdata.blockHeight=imgdata.height;
        }

        // Calculate canvas width
        if(typeof imgdata.blockWidth=="number" && imgdata.blockWidth>this.canvasWidth){
            this.canvasWidth = imgdata.blockWidth;
        }
        // Images with 100% block width need canvas width to be at least their image width
        if(imgdata.width>this.canvasWidth){
            this.canvasWidth = imgdata.width;
        }

        // Calculate maximum canvas height
        this.canvasHeight += imgdata.blockHeight+this.padding;

        // Keep the image object for later use
        imgdata.image = img;

        // Move image data from this.images -> this.processedImages
        this.processedImages.push(imgdata);

        // return
        process.nextTick(callback);
    }).bind(this));

};

/**
 * Sprite#makeMap(css, callback) -> undefined
 * - css (String): Styulus generated CSS
 * - callback (Function): callback to be run when the image is completed
 *
 *
 **/
Sprite.prototype.makeMap = function(css, callback){

    var currentImageData,
        blockImage,
        spriteImage = this.createImage(this.canvasWidth, this.canvasHeight, this.output_format),

        posX, posY,
        curX = 0, curY = 0,
        startX = 0, startY = 0, lineHeight = 0,
        remainder;

    for(var i=0, len = this.processedImages.length; i<len; i++){

        // create image element in correct dimensions
        currentImageData = this.processedImages[i];
        if(currentImageData.blockWidth=="100%"){
            currentImageData.blockWidth = this.canvasWidth;
        }

        posX = 0;
        posY = 0;

        if(currentImageData.width>currentImageData.imageWidth){
            posX = Math.round(currentImageData.width/2-currentImageData.imageWidth/2);
        }

        // Vertical align for positioning image in image element
        if(currentImageData.height>currentImageData.imageHeight){
            switch(currentImageData.valign){
                case "top":
                    posY = 0;
                    break;
                case "bottom":
                    posY = currentImageData.height-currentImageData.imageHeight;
                    break;
                case "middle":
                default:
                    posY = Math.round(currentImageData.height/2 - currentImageData.imageHeight/2);
            }
        }

        // Generate block from image element
        blockImage = this.createImage(currentImageData.width, currentImageData.height);
        if(currentImageData.resize){
            // resize image to dimensions
            currentImageData.image.copyResampled(blockImage,
                0, // dstX
                0, // dstY
                0, // srcX
                0, // srcY
                currentImageData.width,         // dstWidth
                currentImageData.height,        // dstHeight
                currentImageData.imageWidth,    // srcWidth
                currentImageData.imageHeight    // srcHeight
                );
        }else{
            // copy and place in actual dimension (if fits)
            currentImageData.image.copy(blockImage,
                posX, // dstX
                posY, // dstY
                0,    // srcX
                0,    // srcY
                currentImageData.imageWidth,  // srcWidth
                currentImageData.imageHeight  // srcHeight
            );
        }

        // Horizontal align for positioning image element in block
        switch(currentImageData.align){
            case "center":
                curX = Math.round(this.canvasWidth/2 - currentImageData.width/2);
                break;
            case "right":
                curX = this.canvasWidth - currentImageData.width;
                break;
            case "left":
                curX = 0;
                break;
            default:
                curX = 0;
        }

        startX = curX;
        startY = curY;

        // REPEAT:NO
        // copy block to sprite (position curX,curY)
        if(currentImageData.repeat=="no"){
            blockImage.copy(spriteImage, curX, curY, 0, 0, currentImageData.width, currentImageData.height);
            curY += currentImageData.height + this.padding;
        }

        // REPEAT:X
        // copy and replicate block to sprite horizontally
        if(currentImageData.repeat=="x"){
            curX = 0;
            startX = 0;
            while(curX<currentImageData.blockWidth){
                remainder = curX + currentImageData.width<currentImageData.blockWidth?currentImageData.width:currentImageData.blockWidth-curX;
                blockImage.copy(spriteImage, curX, curY, 0, 0, remainder, currentImageData.height);
                curX += currentImageData.width;
            }
            curY += currentImageData.height + this.padding;
        }

        // REPEAT:Y
        // copy and replicate block to sprite horizontally
        if(currentImageData.repeat=="y"){
            while(curY < startY + currentImageData.blockHeight){
                remainder = curY + currentImageData.height<startY + currentImageData.blockHeight?currentImageData.height:startY + currentImageData.blockHeight-curY;
                blockImage.copy(spriteImage, curX, curY, 0, 0, currentImageData.width, remainder);
                curY += remainder;
            }
            curY += this.padding;
        }

        // Replace placeholders from CSS with real positions
        var re = new RegExp("'" + this.placeholder+"\\("+currentImageData._img_id+"\\)'","g"),
            cssPlacementX = "-"+startX+"px",
            cssPlacementY = "-"+startY+"px";

        switch(currentImageData.align){
            case "right":
                cssPlacementX = "100%";
                break;
            case "center":
                cssPlacementX = "center";
                break;
        }

        /* Support generating padding, width and height for the element
         * as a function of the image size.
         * This may be useful if the image sizes may change and you
         * don't want to hardcode them into the CSS file. */
        if ( currentImageData.totalwidth && currentImageData.totalheight ) {
          var imgw = currentImageData.imageWidth,
              imgh = currentImageData.imageHeight,
              // Calculate the total size of the margins
              margw = currentImageData.totalwidth - imgw,
              margh = currentImageData.totalheight - imgh,
              // Calculate the actual margins
              margtop = Math.floor((margh+1)/2),
              margright = Math.floor(margw/2),
              margbottom = Math.floor(margh/2),
              margleft = Math.floor((margw+1)/2);

          /* If the element for which we're computing the background has
           * a non-zero padding and/or border, we need to add the size
           * difference to the generated element width/height, to comply with
           * the CSS box model. */
          if ( currentImageData.padwidth ) {
            imgw += currentImageData.padwidth;
          }
          if ( currentImageData.padheight ) {
            imgh += currentImageData.padheight;
          }

          var appendMargin = ';margin:' + margtop + 'px ' + margright + 'px ' +
                  margbottom + 'px ' + margleft + 'px !important;' +
                  'height:' + imgh + 'px !important;' +
                  'width:' + imgw + 'px !important';
        } else {
          var appendMargin = '';
        }

        css = css.replace(re, cssPlacementX+" "+cssPlacementY+appendMargin);
    }

    // Save to file
    var save_callback = function(){
        console.log("CSS processed");
        callback(null, css);
    };

    switch(this.output_format){
        case "gif":
            spriteImage.saveGif(this.output_file, save_callback.bind(this));
            break;
        case "jpg":
        case "jpeg":
            spriteImage.saveJpeg(this.output_file, 80, save_callback.bind(this));
            break;
        case "png":
        default:
            spriteImage.savePng(this.output_file, 0, (function(){
                var tmp_name = this.output_file + "_tmp" + Date.now();
                if(this.pngcrush){
                    fs.rename(this.output_file, tmp_name, (function(err){
                        if(err){
                            throw err;
                        }
                        exec(this.pngcrush+" "+tmp_name+" "+this.output_file, function(err){
                            fs.unlink(tmp_name);
                            if(err){
                                throw err;
                            }
                            console.log("PNG crushed!");
                            save_callback();
                        });
                    }).bind(this));
                }else{
                    save_callback();
                }
            }).bind(this));

    }
};

Sprite.prototype.openImage = function(image, callback){
    var func;
    switch(image.split(".").pop().toLowerCase()){
        case "png":
            func = "openPng";
            break;
        case "gif":
            func = "openGif";
            break;
        case "jpg":
        case "jpeg":
            func = "openJpeg";
            break;
        default:
            throw new Error("Unknown file type");
    }
    gdlib[func](image, function(err, img, path){
        callback(err, img, path);
    });
};

Sprite.prototype.createImage = function(width, height, format){
    format = format || "png";

    // the image can not be too small to have transparency
    width = Math.max(width, 5);
    height = Math.max(height, 5);

    var img = gdlib.createTrueColor(width, height),
        transparent = format == "gif" && img.colorAllocate(112, 121, 211) || img.colorAllocateAlpha(0, 0, 0, 127);

    img.fill(0, 0, transparent);
    img.colorTransparent(transparent);

    if(format == "png"){
        img.alphaBlending(0);
        img.saveAlpha(1);
    }

    return img;
};


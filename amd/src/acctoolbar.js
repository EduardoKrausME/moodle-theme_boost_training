/**
 * https://github.com/mickidum/acc_toolbar
 */
define(["core/templates"], function (Templates) {
    return {
        init: function () {
            Templates.render('theme_boost_training/settings/acctoolbar', {})
                .then(function (html, js) {
                    window.micAccessTool = new boost_training_AccessTool(html);
                })
                .fail(function (ex) {
                    console.error(ex);
                });
        },
    };
});

function boost_training_AccessTool(html) {
    this.init = {
        link: "",
        contact: "",
        buttonPosition: "right",
    };
    if (this.buildToolBox(html)) {
        this.toolBox = document.getElementById("mic-access-tool-box");
        this.toolBoxOpenButton = document.getElementById("mic-access-tool-general-button");
        this.toolBoxCloseButton = document.getElementById("mic-access-tool-box-close-button");
        this.toolBoxOpenButton.addEventListener("click", this.openBox.bind(this));
        this.toolBoxCloseButton.addEventListener("click", this.closeBox.bind(this));
        document.addEventListener("keyup", this.openCloseBoxKeyboard.bind(this));
        this.micContrastMonochrome = document.getElementById("mic-toolbox-contrast-monochrome");
        this.micContrastSoft = document.getElementById("mic-toolbox-contrast-soft");
        this.micContrastHard = document.getElementById("mic-toolbox-contrast-hard");
        this.micContrastMonochrome.addEventListener("click", this.contrastChange);
        this.micContrastSoft.addEventListener("click", this.contrastChange);
        this.micContrastHard.addEventListener("click", this.contrastChange);
        this.micDisableButtonsAnimations = document.getElementById("mic-toolbox-disable-buttons-animations");
        this.micDisableButtonsAnimations.addEventListener("click", this.onceButtonChange);
        this.micdyslexic = document.getElementById("mic-dyslexic-buttons");
        this.micdyslexic.addEventListener("click", this.onceButtonChange);
        this.micDisableButtonsKeyboard = document.getElementById("mic-toolbox-disable-buttons-keyboard");
        this.micDisableButtonsKeyboard.addEventListener("click", this.onceButtonChange);
        this.micToolboxFontsUp = document.getElementById("mic-toolbox-fonts-up");
        this.micToolboxFontsDown = document.getElementById("mic-toolbox-fonts-down");
        this.micToolboxFontsSimple = document.getElementById("mic-toolbox-fonts-simple");
        this.micToolboxFontsUp.addEventListener("click", this.fontsChange);
        this.micToolboxFontsDown.addEventListener("click", this.fontsChange);
        this.micToolboxFontsSimple.addEventListener("click", this.onceButtonChange);
        this.micToolboxContentLinks = document.getElementById("mic-toolbox-content-links");
        this.micToolboxContentHeaders = document.getElementById("mic-toolbox-content-headers");
        this.micToolboxContentImages = document.getElementById("mic-toolbox-content-images");
        this.micToolboxContentLinks.addEventListener("click", this.onceButtonChange);
        this.micToolboxContentHeaders.addEventListener("click", this.onceButtonChange);
        this.micToolboxContentImages.addEventListener("click", this.onceButtonChange);
        this.micToolboxCursorWhite = document.getElementById("mic-toolbox-cursor-big-white");
        this.micToolboxCursorBlack = document.getElementById("mic-toolbox-cursor-big-black");
        this.micToolboxZoomUp = document.getElementById("mic-toolbox-zoom-up");
        this.micToolboxCursorWhite.addEventListener("click", this.cursorChange);
        this.micToolboxCursorBlack.addEventListener("click", this.cursorChange);
        this.micToolboxZoomUp.addEventListener("click", this.onceButtonChange);
        this.micToolboxDisableButtonsAll = document.getElementById("mic-toolbox-disable-buttons-reset-all");
        this.micToolboxDisableButtonsAll.addEventListener("click", this.resetApp.bind(this));
    }
    this.initialApp();
}

boost_training_AccessTool.prototype.initialApp = function () {

    window.boost_training_toolboxAppstate = JSON.parse(localStorage.getItem('boost_training_ACCESSTOOL')) || {
        bodyClassList: {},
        fontSize: 1,
        imagesTitle: false,
        keyboardRoot: false,
        initFontSize: false
    };

    const iframe = document.querySelector("iframe.h5p-initialized");
    if (iframe) {
        const cssLink = iframe.contentDocument.createElement("link");
        cssLink.rel = "stylesheet";
        cssLink.href = `${M.cfg.wwwroot}/theme/boost_training/style/style-h5p.css`;
        cssLink.type = "text/css";
        iframe.contentDocument.head.appendChild(cssLink);

        this.initialApp_iframe(iframe);
    }

    // INIT ADDING CLASSES TO BODY
    if (window.boost_training_toolboxAppstate.bodyClassList) {

        for (var bodyClass in window.boost_training_toolboxAppstate.bodyClassList) {
            var initBodyClassList = window.boost_training_toolboxAppstate.bodyClassList[bodyClass];
            var enabledButton = document.getElementById(initBodyClassList);
            if (enabledButton) {
                enabledButton.classList.add('vi-enabled');
            }
            document.body.classList.add(initBodyClassList);
        }
    }

    // FONT SIZE INIT
    if (window.boost_training_toolboxAppstate.fontSize > 1) {
        this.initFontsChange();
    }

    // SET IMAGES TITLES
    if (window.boost_training_toolboxAppstate.imagesTitle) {
        this.imagesAddTitles();
    }

    // SET KEBOARD ROOTING
    if (window.boost_training_toolboxAppstate.keyboardRoot) {
        this.keyboardRootEnable();
    }
    if (this.init.buttonPosition === 'right') {
        var button = document.getElementById('mic-access-tool-general-button');
        if (button) {
            document.getElementById('mic-access-tool-general-button').classList.add('mic-access-tool-general-button-right');
            document.getElementById('mic-access-tool-box').classList.add('mic-access-tool-box-right');
        }
    }
};

boost_training_AccessTool.prototype.initialApp_iframe = function (iframe) {
    setInterval(function () {
        var appstate = JSON.parse(localStorage.getItem('boost_training_ACCESSTOOL')) || {
            bodyClassList: false
        };

        iframe.contentDocument.body.classList = [];
        if (appstate.bodyClassList) {
            for (var bodyClass in appstate.bodyClassList) {
                var initBodyClassList = appstate.bodyClassList[bodyClass];
                iframe.contentDocument.body.classList.add(initBodyClassList);
            }
        }
    }, 2000);
};

boost_training_AccessTool.prototype.buildToolBox = function (html) {
    if (document.querySelector("body.pagelayout-embedded")) {
        return false;
    }

    var i = document.createElement("div");
    i.id = "mic-init-access-tool";
    i.innerHTML = html;
    i.style.display = "none";
    document.body.insertBefore(i, document.body.firstChild);

    return true;
};

// CONTRAST FUNCTION
boost_training_AccessTool.prototype.contrastChange = function (event) {
    event.preventDefault();

    if (document.body.classList.contains(this.id)) {
        this.classList.remove('vi-enabled');
        document.body.classList.remove(this.id);

        delete window.boost_training_toolboxAppstate.bodyClassList[this.id];
    } else {
        var buttons = document.querySelectorAll('.mic-contrast-block button');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.remove('vi-enabled');
            document.body.classList.remove(buttons[i].id);

            delete window.boost_training_toolboxAppstate.bodyClassList[buttons[i].id];
        }
        this.classList.add('vi-enabled');
        document.body.classList.add(this.id);

        window.boost_training_toolboxAppstate.bodyClassList[this.id] = this.id;
    }
    boost_training_AccessTool.prototype.updateState();
};

// CURSOR CHANGE
boost_training_AccessTool.prototype.cursorChange = function (event) {
    event.preventDefault();

    if (document.body.classList.contains(this.id)) {
        this.classList.remove('vi-enabled');
        document.body.classList.remove(this.id);
        delete window.boost_training_toolboxAppstate.bodyClassList[this.id];
    } else {
        var buttons = document.querySelectorAll('#mic-toolbox-cursor-big-black,#mic-toolbox-cursor-big-white');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.remove('vi-enabled');
            document.body.classList.remove(buttons[i].id);

            delete window.boost_training_toolboxAppstate.bodyClassList[buttons[i].id];
        }
        this.classList.add('vi-enabled');
        document.body.classList.add(this.id);

        window.boost_training_toolboxAppstate.bodyClassList[this.id] = this.id;
    }
    boost_training_AccessTool.prototype.updateState();
};

boost_training_AccessTool.prototype.onceButtonChange = function (event) {
    event.preventDefault();

    if (this.id === 'mic-toolbox-disable-buttons-keyboard') {
        window.boost_training_toolboxAppstate.keyboardRoot = !window.boost_training_toolboxAppstate.keyboardRoot;
        boost_training_AccessTool.prototype.keyboardRootEnable();
    }

    if (this.id === 'mic-toolbox-content-images') {
        boost_training_AccessTool.prototype.imagesChange();
    }

    if (document.body.classList.contains(this.id)) {
        this.classList.remove('vi-enabled');
        document.body.classList.remove(this.id);

        delete window.boost_training_toolboxAppstate.bodyClassList[this.id];
    } else {
        this.classList.add('vi-enabled');
        document.body.classList.add(this.id);

        window.boost_training_toolboxAppstate.bodyClassList[this.id] = this.id;
    }
    boost_training_AccessTool.prototype.updateState();
};

boost_training_AccessTool.prototype.keyboardRootEnable = function () {
    if (window.boost_training_toolboxAppstate.keyboardRoot) {
        var headers = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,input,select,textarea');
        for (var i = 0; i < headers.length; i++) {
            var item = headers[i];
            item.tabIndex = i + 1
        }
    } else {
        window.location.reload();
    }
};

// FONTS CHANGE
boost_training_AccessTool.prototype.fontsChange = function (event) {
    event.preventDefault();

    // var mainBody = Number(document.body.style.fontSize.split('px')[0]);

    var counter = window.boost_training_toolboxAppstate.fontSize;

    if (this.id === 'mic-toolbox-fonts-up') {
        if (counter >= 1.6) {
            return
        }
        var items = document.querySelectorAll('body,h1,h2,h3,h4,h5,h6,p,a,button,input,textarea,li,td,th,strong,span,blockquote,div');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var font = window.getComputedStyle(item).getPropertyValue('font-size').split('px');
            var fontSize = Number(font[0]);
            item.style.fontSize = (fontSize * 1.1).toFixed() + 'px';
        }
        counter = (counter * 1.1).toFixed(2);
    }
    if (this.id === 'mic-toolbox-fonts-down') {
        if (counter <= 1) {
            window.boost_training_toolboxAppstate.fontSize = 1;
            boost_training_AccessTool.prototype.updateState();
            return;
        }
        var items = document.querySelectorAll('body,h1,h2,h3,h4,h5,h6,p,a,button,input,textarea,li,td,th,strong,span,blockquote,div');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var font = window.getComputedStyle(item).getPropertyValue('font-size').split('px');
            var fontSize = Number(font[0]);
            item.style.fontSize = (fontSize / 1.1).toFixed() + 'px';
        }
        counter = (counter / 1.1).toFixed(2);
    }

    window.boost_training_toolboxAppstate.fontSize = counter;
    boost_training_AccessTool.prototype.getFontsChanges(counter);
    boost_training_AccessTool.prototype.updateState();

};

// INITIAL FONT SIZE
boost_training_AccessTool.prototype.initFontsChange = function () {
    var items = document.querySelectorAll('body,h1,h2,h3,h4,h5,h6,p,a,button,input,textarea,li,td,th,strong,span,blockquote,div');
    var initFontSize = window.boost_training_toolboxAppstate.fontSize;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var font = window.getComputedStyle(item).getPropertyValue('font-size');
        item.style.fontSize = font;
        var fs = item.style.fontSize.split('px');
    }
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var font = window.getComputedStyle(item).getPropertyValue('font-size').split('px');
        var fs = Number(font[0]);
        item.style.fontSize = (fs * initFontSize).toFixed() + 'px';
    }
    if (initFontSize) {
        this.getFontsChanges(initFontSize);
    }
};

boost_training_AccessTool.prototype.initFontsChangeFirst = function () {
    var items = document.querySelectorAll('body,h1,h2,h3,h4,h5,h6,p,a,button,input,textarea,li,td,th,strong,span,blockquote,div');
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var font = window.getComputedStyle(item).getPropertyValue('font-size');
        item.style.fontSize = font;
        var fs = item.style.fontSize.split('px');
    }
};

boost_training_AccessTool.prototype.getFontsChanges = function (initFontSize) {
    if (initFontSize > 1) {
        document.getElementById('mic-toolbox-fonts-up').classList.add('vi-font-enabled');
        var initPerc = (Number(initFontSize) * 100 - 100).toFixed();
        var perc = '+' + initPerc + '%';
        document.getElementById('mic-toolbox-fonts-up-enabled').textContent = perc;
    } else {
        document.getElementById('mic-toolbox-fonts-up').classList.remove('vi-font-enabled');
        document.getElementById('mic-toolbox-fonts-up-enabled').textContent = "";
    }
};

// IMAGES CHANGE
boost_training_AccessTool.prototype.imagesChange = function () {

    if (document.body.classList.contains('mic-toolbox-content-images')) {

        var titles = document.querySelectorAll('.mic-toolbox-images-titles');
        for (var i = 0; i < titles.length; i++) {
            var parent = titles[i].parentElement;
            parent.removeChild(titles[i]);
        }
        window.boost_training_toolboxAppstate.imagesTitle = false;
    } else {
        this.imagesAddTitles();
        window.boost_training_toolboxAppstate.imagesTitle = true;
    }
};

boost_training_AccessTool.prototype.imagesAddTitles = function () {

    var images = document.images;
    for (var i = 0; i < images.length; i++) {
        var img = images[i];
        if (img.alt) {
            var title = document.createElement('span');
            title.className = 'mic-toolbox-images-titles';
            title.textContent = img.alt;
            img.parentNode.insertBefore(title, img);
        } else {
            var title = document.createElement('span');
            title.className = 'mic-toolbox-images-titles';
            title.textContent = 'image without text';
            img.parentNode.insertBefore(title, img);
        }
    }

};

boost_training_AccessTool.prototype.updateState = function () {
    var jsonSting = JSON.stringify(window.boost_training_toolboxAppstate);
    if (typeof (Storage) !== "undefined") {
        localStorage.setItem('boost_training_ACCESSTOOL', jsonSting);
    } else {
        console.log('No Storage Found');
    }
};


boost_training_AccessTool.prototype.openBox = function (event) {
    this.toolBox.classList.add('opened-mic-access-tool');
    if (!window.boost_training_toolboxAppstate.initFontSize || window.boost_training_toolboxAppstate.fontSize <= 1) {
        this.initFontsChangeFirst();
        window.boost_training_toolboxAppstate.initFontSize = true;
    }
    this.toolBoxCloseButton.focus();
};

boost_training_AccessTool.prototype.closeBox = function (event) {
    this.toolBox.classList.remove('opened-mic-access-tool');
};

boost_training_AccessTool.prototype.openCloseBoxKeyboard = function (event) {
    if (event.keyCode == 27) {
        this.closeBox();
    }
    if (event.ctrlKey && event.keyCode == 113) {
        this.openBox();
    }
};

boost_training_AccessTool.prototype.resetApp = function (event) {
    localStorage.removeItem('boost_training_ACCESSTOOL');
    window.location.reload();
};

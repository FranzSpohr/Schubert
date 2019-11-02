// ==UserScript==
// @name         Slate Reader Zoom
// @namespace    https://umich.edu/
// @version      11.1.19
// @description  For Slate Reader. Opens a page with a highder DPI render of document. Needs Tampermonkey for Chrome or Greasemonkey for Firefox.
// @author       University of Michigan OUA Processing (Theodore Ma)
// @match        https://*/manage/reader/*
// @updateURL    //https://github.com/FranzSpohr/Slate_Tools/blob/master/reader_zoom.user.js
// ==/UserScript==

var zoomLevel = 0; // zoom level of a page
var slideIndex = 1; // which page to display in viewer
var imageLoaded = false; // toggled when higher DPI images are loaded
var activeTab; // Slate tab that the images were loaded from
var activeApp // app currently being displayed
var tooltipTimer; // for the timer that times out the tooltip after 15 seconds
var pageNumber; // stores the element containing page numbers

// creates an overlay that serves as a canvas for all elements created by this userscript
var overlay = document.createElement('div');
overlay.id = 'overlayUMich';
overlay.onclick = function() {toggleZoom('left')};
overlay.oncontextmenu = function() {toggleZoom('right')};
document.body.appendChild(overlay);
overlay.addEventListener('keydown', key_handler, true);
overlay.addEventListener('wheel', hideElements, {passive: false});
overlay.addEventListener('wheel', hideTooltip, {passive: false});
overlay.className = 'dragscroll'; // enables scrolling by mouse drag
overlay.tabIndex = -1; // enables keyboard controls by setting focus on the overlay

// injects button into the footer of Slate Reader. clicking it will open the viewer.
var input = document.createElement('input');
input.type = 'button';
input.id = 'buttonUMich';
input.value = 'Display Larger Images';
input.onclick = overlayOn;
document.getElementsByClassName('reader_footer')[0].appendChild(input);

// calls overlay and displays higher DPI images
function overlayOn() {
  // needs to be loaded first to determine whether the current Slate tab has any images or not, displays alert if no images available
  const imageLink = document.querySelector('body > div.reader_viewer.reader_scrollable > div > div.container.active.loaded > div > img');
  if (imageLink == null) {
    alert('Navigate to a tab with documents first.');
    return;
  }
  // uses regular expressions to extract data needed to determine the number of needed new HTML elements
  var startPage = 1;
  var currentPage = document.getElementsByClassName('reader_status')[0].childNodes[0].textContent.match(/\d+/);
  var endPage = document.getElementsByClassName('reader_status')[0].childNodes[0].textContent.match(/\d+(?=,)/);

  // determines which Slate tab is currently being displayed
  var targetApp = document.getElementsByClassName('reader_header_title')[0].innerHTML;
  var targetTab = document.getElementsByClassName('stream active')[0].innerHTML;

  if (imageLoaded) {
	// determines whether the Slate tab or student being displayed has changed. If changed, deletes existing HTML elements and creates new ones
    if(activeTab !== targetTab || activeApp !== targetApp) {
      while (overlay.firstChild) {
	    // necessary to prevent unused HTML elements from cluttering the page
        overlay.removeChild(overlay.firstChild);
      }
      addElements(imageLink, startPage, endPage, currentPage);
      displayTooltip();
    } else {
      slideIndex = parseInt(currentPage, 10); // for whatever reason, parseInt is required to convert the slindeIndex into an integer
      showSlides(slideIndex);
      displayTooltip();
      overlay.scrollTo(0,0); // return to top of the page
      return;
    }
  } else {
    addElements(imageLink, startPage, endPage, currentPage);
    displayTooltip();
  }
}

// adds HTML elements needed for the userscript to function
function addElements(imageSrc, startPg, endPg, currPg) {
  var iframeUM = document.getElementsByTagName('iframe')[0].contentWindow.document.body; // iframe declared to access student info
  var table = iframeUM.getElementsByClassName('grey')[0]; // declares table containing UMID
  var appName = iframeUM.getElementsByClassName('fullname')[0].innerHTML; // student name
  var appID = table.rows[1].cells[0].innerHTML + " " + table.rows[1].cells[1].innerHTML; // student UMID

  var studentInfo = document.createElement('div');
  studentInfo.id = 'studentUMich';
  studentInfo.innerHTML = appName + '<br>' + appID;
  studentInfo.onclick = overlayOff;
  document.getElementById('overlayUMich').appendChild(studentInfo);

  var openTooltip = document.createElement('div');
  openTooltip.id = 'opentooltipUMich';
  openTooltip.innerHTML = '?';
  openTooltip.onclick = displayTooltip;
  document.getElementById('overlayUMich').appendChild(openTooltip);

  // page counter on the upper right corner, does not need to be looped?
  var pgCounter = document.createElement('div');
  pgCounter.id = 'numbertextUMich';
  pgCounter.innerHTML = 'Page ' + currPg + ' of ' + endPg;
  pgCounter.onclick = overlayOff;
  document.getElementById('overlayUMich').appendChild(pgCounter);

  // creates anchor elements on the edges of the screen for switching between pages
  var forward = document.createElement('a');
  forward.className = 'nextUMich';
  forward.onclick = function() {plusSlides(1)};
  forward.innerHTML = '&#10095';
  document.getElementById('overlayUMich').appendChild(forward);

  // creates anchor elements on the edges of the screen for switching between pages
  var backward = document.createElement('a');
  backward.className = 'prevUMich';
  backward.onclick = function() {plusSlides(-1)};
  backward.innerHTML = '&#10094';
  document.getElementById('overlayUMich').appendChild(backward);

  // container for the navigation dots
  var dotContainer = document.createElement('div');
  dotContainer.id = 'dotContainerUMich';
  document.getElementById('overlayUMich').appendChild(dotContainer);

  for (let i = startPg; i <= endPg; i++) {
    // Contains the images
    var slides = document.createElement('div');
    slides.id = 'slide_' + i;
    slides.className = 'mySlidesUMich';
    document.getElementById('overlayUMich').appendChild(slides);

	// dots that can be used to navigate pages
    var navDots = document.createElement('span');
    navDots.className = 'dotUMich';
    navDots.onclick = function() {currentSlide(i)};
    dotContainer.appendChild(navDots);

	// displays page info above dots
    var dotHover = document.createElement('span');
    dotHover.className = 'dotHoverUMich';
    dotHover.innerHTML = 'Page ' + i;
    navDots.appendChild(dotHover);

    var imageElement = document.createElement('img'); // element for higher DPI images of the documents
    var imageNewSrc = imageSrc.src.replace(/z=\d*/, 'z=300'); // replaces the part of URL that specifies DPI of the image
    var errorDPI = 200 // lowers requested DPI if image fails to be loaded

    // modifies the page number component of the URL to attach correct pages to the slides
    imageNewSrc = imageNewSrc.replace(/pg=\d*/, `pg=${i-1}`);
    imageElement.id = 'image_' + i;
    imageElement.src = imageNewSrc;
    imageElement.style.width = '100%';
	// if image cannot be loaded due to request DPI being too high, lowers DPI by 10 until loading is succesful
    imageElement.onerror = function() {errorDPI -= 10; this.src = this.src.replace(/z=\d*/, `z=${errorDPI}`)};
    document.getElementById('slide_' + i).appendChild(imageElement);
  }
  activeTab = document.getElementsByClassName('stream active')[0].innerHTML;
  activeApp = document.getElementsByClassName('reader_header_title')[0].innerHTML;
  pageNumber = document.getElementById('numbertextUMich');
  zoomLevel = 0;
  imageLoaded = true;
  slideIndex = parseInt(currPg, 10);
  showSlides(slideIndex); // opens the viewer and displays the page currently being displayed in Slate Reader
}

// handles keyboard inputs
function key_handler(event) {
  hideTooltip();
  if (event.code == 'ArrowRight') {
    plusSlides(1);
  } else if (event.code == 'ArrowLeft') {
    plusSlides(-1);
  } else if (event.code == 'Escape') {
    overlayOff();
  }
  event.stopPropagation(); // without this, pages in Slate Reader will scroll even with the zoomed viewer displayed.
}

function overlayOff() {
  const element = document.getElementById('image_' + slideIndex);
  // resets the zoom state of the current page displayed
  element.setAttribute('style', 'width:100%');
  zoomLevel = 0;
  document.getElementById('overlayUMich').style.display = 'none';
  hideTooltip();
}

// kind of a janky way to change zoom levels of a document by just changing image's width, could use improvement?
function toggleZoom(mouseButton) {
  const element = document.getElementById('image_' + slideIndex);
  var zLevels = [100, 125, 150];
  hideTooltip();
  if(mouseButton == 'left') {
    zoomLevel++;
    overlay.style.cursor = 'zoom-in'
    if (zoomLevel >= zLevels.length) {zoomLevel = 0};
  } else if (mouseButton == 'right') {
    overlay.style.cursor = 'zoom-in'
    if (zoomLevel == 0) {overlayOff()} else {zoomLevel--};
  }
  element.setAttribute('style', 'width:' + zLevels[zoomLevel] + '%');
}

// displays tooltip. Should disappear after 10 seconds or upon any input from the user
function displayTooltip() {
  var tooltip = document.createElement('div');
  tooltip.id = 'tooltipUMich';
  tooltip.innerHTML = tooltipText;
  tooltip.style.display = 'block';
  document.getElementById('overlayUMich').appendChild(tooltip);
  // automatically hides tooltip after 15 seconds
  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(function() {if (document.getElementById('tooltipUMich') == null) {return;} else {tooltip.parentNode.removeChild(tooltip)}}, 15000);
  overlay.style.display = 'block';
  overlay.focus();
}

// texts for tooltip
const tooltipText =
      "<p>Navigate between pages by<strong><font color='#ffcb05'>&nbsp;left clicking on arrows</font></strong><br>at the edges of the screen.</p>" +
      "<p><strong><font color='#ffcb05'>Left click on the dots&nbsp;</font></strong>near the bottom of the screen<br>to jump between pages.</p>" +
      "<table id='tableUMich'>" +
      "<tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Esc Key:</td><td class='cellNavUMich'>Return to Reader</td></tr>" +
      "<tr class='cellBlankUMich'><td colspan='3'></td></tr>" +
      "<tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Left Click:</td><td class='cellNavUMich'>Zoom in</td></tr>" +
      "<tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Left Click &<br> Mouse Drag:</td><td class='cellNavUMich'>Scroll document</td></tr>" +
      "<tr class='cellBlankUMich'><td colspan='3'></td></tr>" +
      "<tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Right Click:</td><td class='cellNavUMich'>Zoom out</td></tr>" +
      "<tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Right Click:<br><font size='1'>(if on default zoom level)</font></td><td class='cellNavUMich'>Return to Reader</td></tr>" +
      "<tr class='cellBlankUMich'><td colspan='3'></td></tr>" +
      "<tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Up Arrow Key:</td><td class='cellNavUMich'>Scroll up</td></tr>" +
      "<tr></tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Down Arrow Key:</td><td class='cellNavUMich'>Scroll down</td></tr>" +
      "<tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Left Arrow Key:</td><td class='cellNavUMich'>Previous page</td></tr>" +
      "<tr><td style='width:20px'><li></li></td><td class='cellKeyUMich'>Right Arrow Key:</td><td class='cellNavUMich'>Next page</td></tr>" +
      "</table>" +
      "<p>If you encounter issues or have any suggestions or<br>requests, contact Teddy Ma at <a style='color: #ffcb05' href='mailto:tedma@umich.edu'>tedma@umich.edu</a>.</b></p>"

// HTML element for the tooltip destroyed after each instance to prevent clutter
function hideTooltip() {
  var tooltip = document.getElementById('tooltipUMich');
  clearTimeout(tooltipTimer);
  if (tooltip != null) {
    tooltip.parentNode.removeChild(tooltip);
  }
}

// needed to reset the timer and prevent the dot from appearing again too soon
var timeoutHandle = setTimeout(function() {
  if (document.getElementById('dotContainerUMich') == null) {
    return;
  } else {
    document.getElementById('dotContainerUMich').style.display = 'block';
    document.getElementById('studentUMich').style.display = 'block';
    pageNumber.style.display = 'block'
  }
}, 500);

function hideElements() {
  document.getElementById('dotContainerUMich').style.display = 'none';
  document.getElementById('studentUMich').style.display = 'none';
  pageNumber.style.display = 'none';
  clearTimeout(timeoutHandle);
  timeoutHandle = setTimeout(function() {
    if (document.getElementById('dotContainerUMich') == null);
      document.getElementById('dotContainerUMich').style.display = 'block';
      document.getElementById('studentUMich').style.display = 'block';
      pageNumber.style.display = 'block';
  }, 500)
}

// handles switching between pages
function plusSlides(n) {
  const currImage = document.getElementById('image_' + slideIndex);
  currImage.setAttribute('style', 'width:100%');
  zoomLevel = 0;
  showSlides(slideIndex += n);
  overlay.scrollTo(0,0); // return to top of the page
}

// used by dots to navigate pages
function currentSlide(n) {
  showSlides(slideIndex = n);
}

// adopted from slideshow turorial in W3C
function showSlides(n) {
  var i;
  var slides = document.getElementsByClassName('mySlidesUMich');
  var dots = document.getElementsByClassName("dotUMich");
  if (n > slides.length) {slideIndex = 1};
  if (n < 1) {slideIndex = slides.length};
  for (i = 0; i < slides.length; i++) {
    slides[i].style.display = 'none';
  }
  for (i = 0; i < dots.length; i++) {
      dots[i].className = dots[i].className.replace(' activeUMich', '');
  }
  slides[slideIndex-1].style.display = 'block';
  dots[slideIndex-1].className += ' activeUMich';
  pageNumber.innerHTML = pageNumber.innerHTML.replace(/^[^\d]*(\d+)/, 'Page ' + slideIndex);
}

// literally just copy pasted code from asvd's dragscroll library. Div overlayUMmich is assigned ID of dragscroll
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.dragscroll = {}));
  }
} (this, function (exports) {
  var _window = window;
  var _document = document;
  var mousemove = 'mousemove';
  var mouseup = 'mouseup';
  var mousedown = 'mousedown';
  var mouseenter = 'mouseenter';
  var click = 'click';
  var EventListener = 'EventListener';
  var addEventListener = 'add'+EventListener;
  var removeEventListener = 'remove'+EventListener;
  var newScrollX, newScrollY;
  var moveThreshold = 4;
  var dragged = [];
  var reset = function(i, el) {
    for (i = 0; i < dragged.length;) {
      el = dragged[i++];
      el = el.container || el;
      el[removeEventListener](mousedown, el.md, 0);
      el[removeEventListener](click, el.mc, 0);
      _window[removeEventListener](mouseup, el.mu, 0);
      _window[removeEventListener](mousemove, el.mm, 0);
      _document[removeEventListener](mouseenter, el.me, 0);
    }

    // cloning into array since HTMLCollection is updated dynamically
    dragged = [].slice.call(_document.getElementsByClassName('dragscroll'));
    for (i = 0; i < dragged.length;) {
      (function(el, lastClientX, lastClientY, startX, startY, moved, pushed, scroller, cont){
        (cont = el.container || el)[addEventListener](
          mousedown,
          cont.md = function(e) {
            if (!el.hasAttribute('nochilddrag') ||
                _document.elementFromPoint(
              e.pageX, e.pageY
            ) == cont
               ) {
              pushed = 1;
              moved = 0;
              startX = lastClientX = e.clientX;
              startY = lastClientY = e.clientY;
              hideTooltip(); //change from original script, hides tooltip on mouse movement
              e.preventDefault();
              e.stopPropagation();
            }
          }, 0
        );
        (cont = el.container || el)[addEventListener](
          click,
          cont.mc = function(e) {
            if (moved) {
              e.preventDefault();
              e.stopPropagation();
              moved = 0; pushed = 0;
            }
          }, 1
        );
        _window[addEventListener](
          mouseup, cont.mu = function() {pushed = 0;}, 0
        );
        _document[addEventListener](
          mouseenter, cont.me = function(e) {if (!e.buttonsPressed) pushed = 0;}, 0
        );
        _window[addEventListener](
          mousemove,
          cont.mm = function(e) {
            if (pushed) {
              hideElements(); // another addition to original script, hides dots while scrolling
              if (!moved &&
                  (Math.abs(e.clientX - startX) > moveThreshold ||
                   Math.abs(e.clientY - startY) > moveThreshold)) {
                moved = true;
              }
              if (moved) {
                (scroller = el.scroller||el).scrollLeft -=
                  newScrollX = (- lastClientX + (lastClientX=e.clientX));
                scroller.scrollTop -=
                  newScrollY = (- lastClientY + (lastClientY=e.clientY));
                if (el == _document.body) {
                  (scroller = _document.documentElement).scrollLeft -= newScrollX;
                  scroller.scrollTop -= newScrollY;
                }
              }
            }
          }, 0
        );
      })(dragged[i++]);
    }
  }

  if (_document.readyState == 'complete') {
    reset();
  } else {
    _window[addEventListener]('load', reset, 0);
  }

  exports.reset = reset;
}));
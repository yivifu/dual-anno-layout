class DualAnnoLayout {
    constructor(element, option={}) {
        this.element = element;
        this.originalHTML = element.innerHTML;
        this.noHeading = option.noHeading || '!%),.:;>?]}¢¨°·ˇˉ―‖’”…‰′″›℃∶、。〃〉》」』】〕〗〞︶︺︾﹀﹄﹚﹜﹞！＂％＇），．：；？］｀｜｝～￠';
        this.noTailing = option.noTailing || '$([{£¥·‘“〈《「『【〔〖〝﹙﹛﹝＄（．［｛￡￥';
        this.minAnnoChars = option.minAnnoChars || 2;
        this.rightAdjust = option.rightAdjust || 5;
        this.annoClass = option.annoClass || 'annotation';
        this.moveForIlleChar = option.moveForIlleChar || 3;
        this.ctx = document.createElement('canvas').getContext('2d');
        this.charIndexCache = new WeakMap();
        this.ticking = false;

        if (!this.hasAnnotation()) return;
        this.init();
    }

    hasAnnotation() {
        const temp = document.createElement('div');
        temp.innerHTML = this.originalHTML;
        return temp.querySelector(`.${this.annoClass}`) !== null;
    }

    init() {
        window.addEventListener('resize', () => {
            if (!this.ticking) {
                requestAnimationFrame(() => {
                    this.render();
                    this.ticking = false;
                });
                this.ticking = true;
            }
        });
        this.render();
    }

    updateMaxWidth() {
        const style = window.getComputedStyle(this.element);
        const rect = this.element.getBoundingClientRect();        
        this.maxWidth = rect.width - this.getHorizontalExtraWidth(this.element) - this.rightAdjust;
    }

    measureTextWidth(text, element) {
        if (!text) return 0;
        const style = window.getComputedStyle(element);
        this.ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        this.ctx.letterSpacing = style.letterSpacing;
        return this.ctx.measureText(text).width;
    }

    buildCharIndexMap(element) {// 先查缓存，命中则直接返回
        if (this.charIndexCache.has(element)) {
            return this.charIndexCache.get(element);
        }
        const map = new Map();
        let acc = 0;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.length > 0) {
                map.set(node, acc);
                acc += node.textContent.length;
            }
        }
        // 存入缓存
        this.charIndexCache.set(element, map);
        return map;
    }

    insertBrAtGlobalIndex(element, globalIndex, charIndexMap) {
        for (let [node, start] of charIndexMap) {
            const end = start + node.textContent.length;
            if (globalIndex >= start && globalIndex <= end) {
                const parent = node.parentNode;
                if (!parent) return false;
                let br;
                if (globalIndex === start) {
                    br = document.createElement('br');
                    parent.insertBefore(br, node);
                } else if (globalIndex === end) {
                    br = document.createElement('br');
                    parent.insertBefore(br, node.nextSibling);
                } else {
                    let offset = globalIndex - start;
                    let moved = 0;
                    const text = node.textContent;                    
                    while(moved < this.moveForIlleChar && offset < end && this.noHeading.includes(text[offset])) {
                        offset++;
                        moved++;
                    }
                    const before = text.slice(0, offset);
                    const after = text.slice(offset);
                    const beforeNode = document.createTextNode(before);
                    const afterNode = document.createTextNode(after);
                    br = document.createElement('br');
                    parent.insertBefore(beforeNode, node);
                    parent.insertBefore(br, node);
                    parent.insertBefore(afterNode, node);
                    parent.removeChild(node);
                }
                let hasTextBefore = false;
                let prev = br.previousSibling;
                while (prev) {
                    if (prev.nodeType === Node.TEXT_NODE && prev.textContent.trim()) {
                        hasTextBefore = true;
                        break;
                    }
                    prev = prev.previousSibling;
                }
                if (!hasTextBefore) {
                    parent.insertBefore(document.createTextNode('\u00A0'), br);
                }
                let hasTextAfter = false;
                let next = br.nextSibling;
                while (next) {
                    if (next.nodeType === Node.TEXT_NODE && next.textContent.trim()) {
                        hasTextAfter = true;
                        break;
                    }
                    next = next.nextSibling;
                }
                if (!hasTextAfter) {
                    parent.insertBefore(document.createTextNode('\u00A0'), br.nextSibling);
                }
                return element;
            }
        }
        return null;
    }

    extractFragment(element, startChar, endChar, charIndexMap) {
        const startPos = this.getNodeAndOffset(startChar, charIndexMap);
        const endPos = this.getNodeAndOffset(endChar, charIndexMap);
        if (!startPos || !endPos) return null;
        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        const fragment = range.cloneContents();
        return fragment;
    }

    getNodeAndOffset(charIndex, charIndexMap) {
        for (let [node, start] of charIndexMap) {
            const text = node.textContent;
            const end = start + text.length;
            // 正文中元素内容的避行首行尾非法字符处理
            if (charIndex >= start && charIndex <= end) {
                return {node, offset: charIndex - start};
            }
        }
        return null;
    }

    getSubWidth(element, startIdx, endIdx, charIndexMap) {
        if (startIdx >= endIdx) return 0;
        let total = 0;
        for (let [node, nodeStart] of charIndexMap) {
            const nodeEnd = nodeStart + node.textContent.length;
            if (nodeEnd <= startIdx) continue;
            if (nodeStart >= endIdx) break;
            const sliceStart = Math.max(0, startIdx - nodeStart);
            const sliceEnd = Math.min(node.textContent.length, endIdx - nodeStart);
            if (sliceEnd > sliceStart) {
                const textSlice = node.textContent.slice(sliceStart, sliceEnd);
                const parentForStyle = node.parentElement || element;
                total += this.measureTextWidth(textSlice, parentForStyle);
            }
        }
        return total;
    }

    getWidthUpTo(n, elem, charMap = null) {
        const map = charMap || this.buildCharIndexMap(elem);
        return this.getSubWidth(elem, 0, n, map);
    }

    splitElementByCharIndex(originalElem, splitIdx) {
        const totalLen = originalElem.textContent.length;
        if (splitIdx <= 0) return {front: null, back: originalElem.cloneNode(true)};
        if (splitIdx >= totalLen) return {front: originalElem.cloneNode(true), back: null};

        const charMap = this.buildCharIndexMap(originalElem);

        const startPos = this.getNodeAndOffset(0, charMap);
        const endPosFront = this.getNodeAndOffset(splitIdx, charMap);
        const endPosTotal = this.getNodeAndOffset(totalLen, charMap);
        if (!startPos || !endPosFront || !endPosTotal) {
            return {front: originalElem.cloneNode(true), back: null};
        }
                
        const rangeFront = document.createRange();
        rangeFront.setStart(startPos.node, startPos.offset);

        const rangeBack = document.createRange();
        rangeBack.setStart(endPosFront.node, endPosFront.offset);
        rangeBack.setEnd(endPosTotal.node, endPosTotal.offset);
        // 避免下行行首出现非法字符
        const text = rangeBack.toString(); 
        let moved = 0;
        while(moved < this.moveForIlleChar && moved < text.length && this.noHeading.includes(text[moved])) {
            moved++;
            endPosFront.offset++;
        }
        rangeFront.setEnd(endPosFront.node, endPosFront.offset);
        rangeBack.setStart(endPosFront.node, endPosFront.offset);
        const frontFrag = rangeFront.cloneContents();
        const backFrag = rangeBack.cloneContents();

        const cloneWithAttrs = (elem) => {
            const clone = document.createElement(elem.tagName);
            for (let i = 0; i < elem.attributes.length; i++) {
                const attr = elem.attributes[i];
                clone.setAttribute(attr.name, attr.value);
            }
            if (elem.style && elem.style.cssText) clone.style.cssText = elem.style.cssText;
            return clone;
        };

        const frontElem = cloneWithAttrs(originalElem);
        const backElem = cloneWithAttrs(originalElem);
        frontElem.appendChild(frontFrag);
        backElem.appendChild(backFrag);
        return {front: frontElem, back: backElem};
    }

    splitElementByWidth(elem, remainWidth, extraWidth) {
        const totalLen = elem.textContent.length;
        if (totalLen === 0) return {fitted: null, rest: null, usedWidth: 0};

        const fullWidth = this.getWidthUpTo(elem.textContent.length, elem) + extraWidth;
        if (fullWidth <= remainWidth) {
            return {fitted: elem.cloneNode(true), rest: null, usedWidth: fullWidth};
        }

        let low = 0, high = totalLen, bestLen = 0;
        const charMap = this.buildCharIndexMap(elem);
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const width = this.getSubWidth(elem, 0, mid, charMap) + extraWidth;
            if (width <= remainWidth) {
                bestLen = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        if (bestLen === 0) bestLen = 1;

        const {front, back} = this.splitElementByCharIndex(elem, bestLen);
        const usedWidth = front ? (this.getWidthUpTo(front.textContent.length, front) + extraWidth) : 0;
        return {fitted: front, rest: back, usedWidth: usedWidth};
    }

    getDualWidthAndSplit(annoElem, n, noHeading, remainW) {
        const fullText = annoElem.textContent;
        // 分割点n处如果是非法行首字符，移动不超过this.moveForIlleChar个字符调整分割点避开非法行首字符
        let moved = 0;
        while(moved < this.moveForIlleChar && n < fullText.length && noHeading.includes(fullText[n])){
            n++;
            moved++;
        }
        const sub = fullText.slice(0, n);
        if (sub.length === 0) return {width: 0, split: 0};
        let bestSplit = Math.floor(sub.length / 2);
        if (bestSplit < 1) bestSplit = 1;

        const totalW = this.getWidthUpTo(n, annoElem);
        let minS = 1;
        for (let s = 1; s < sub.length; s++) {
            const wb = totalW - this.getWidthUpTo(s, annoElem);
            if (wb <= remainW) {
                minS = s;
                break;
            }
        }
        let maxS = sub.length - 1;
        for (let s = sub.length - 1; s >= minS; s--) {
            const wa = this.getWidthUpTo(s, annoElem);
            if (wa <= remainW) {
                maxS = s;
                break;
            }
        }
        bestSplit = Math.ceil((minS + maxS) / 2);
        const w1 = this.getWidthUpTo(bestSplit, annoElem);
        const w2 = totalW - w1;
        return {width: Math.max(w1, w2), split: bestSplit};
    }

    measureTextFit(text, element, maxWidth) {
        if (!text) return 0;
        let left = 0, right = text.length, fit = 0;
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const w = this.measureTextWidth(text.slice(0, mid), element);
            if (w <= maxWidth) {
                fit = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return fit;
    }

    getHorizontalExtraWidth(element) {
        const style = window.getComputedStyle(element);
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        const marginLeft = parseFloat(style.marginLeft) || 0;
        const marginRight = parseFloat(style.marginRight) || 0;
        const borderLeft = parseFloat(style.borderLeftWidth) || 0;
        const borderRight = parseFloat(style.borderRightWidth) || 0;
        return (paddingLeft + paddingRight + borderLeft + borderRight + marginLeft + marginRight);
    }

    // 2. Render：混合处理
    render() {
        this.updateMaxWidth();
        if (!document.querySelector('#anno-style')) {
            const style = document.createElement('style');
            style.id = 'anno-style';
            style.textContent = `.${this.annoClass} { display: inline-block !important; font-size: max(calc(1em * var(--anno-scale)), 0.6em); vertical-align: middle; margin: 1px; padding: 1px; line-height: 1.4; } .line { white-space: nowrap !important; overflow: visible !important; }`;
            document.head.appendChild(style);
        }
        if (this.maxWidth <= 0) return;

        this.element.innerHTML = this.originalHTML;
        this.renderPara(this.element);
    }

    renderPara(para) {
        const items = [];
        for (let child of para.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                items.push({type: 'text', node: child, parent: child.parentElement});
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                if (child.classList.contains(this.annoClass)) {
                    items.push({type: 'anno', node: child});
                } else {
                    items.push({type: 'element', node: child});
                }
            }
        }

        const paraFrag = document.createDocumentFragment();
        let lineDiv = document.createElement('div');
        lineDiv.className = 'line';
        lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
        let remainW = this.maxWidth;
        while (items.length > 0) {
            const item = items.shift();
            if (item.type === 'text') {
                let textNode = item.node;
                let text = textNode.textContent;
                // 每行开头的非法行首字符全部插入上一行末尾
                if(lineDiv.textContent.length === 0){
                    let illegalLeadding = "", i = 0;
                    while ( i < text.length && this.noHeading.includes(text[i])){
                        illegalLeadding += text[i];
                        i++;
                    }
                    if(i > 0){
                        const tmpNode = document.createTextNode(illegalLeadding);
                        paraFrag.lastChild.appendChild(tmpNode);
                        text = text.slice(i);
                        textNode = document.createTextNode(text);
                    }
                }
                const fullWidth = this.measureTextWidth(text, item.parent);
                if (fullWidth <= remainW) {
                    remainW -= fullWidth;
                    lineDiv.appendChild(textNode.cloneNode(true));
                } else {
                    let fitChars = this.measureTextFit(text, item.parent, remainW);
                    if (fitChars === 0) {
                        // 换行
                        paraFrag.appendChild(lineDiv);
                        lineDiv = document.createElement('div');
                        lineDiv.className = 'line';
                        lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
                        remainW = this.maxWidth;
                        items.unshift(item);
                        continue;
                    }
                    // 调整 fitChars 以避免行首行尾出现不合适的标点
                    while (fitChars > 0 && this.noTailing.includes(text[fitChars - 1])) fitChars--;
                    while (fitChars < text.length && this.noHeading.includes(text[fitChars])) fitChars++;
                    if (fitChars === 0) fitChars = 1;
                    const fitText = text.slice(0, fitChars);
                    const restText = text.slice(fitChars);
                    const fittedSpan = document.createElement('span');
                    fittedSpan.textContent = fitText;
                    lineDiv.appendChild(fittedSpan);
                    remainW -= this.measureTextWidth(fitText, item.parent);
                    if (restText) {
                        const restNode = document.createTextNode(restText);
                        items.unshift({type: 'text', node: restNode, parent: item.parent});
                    }
                    // 换行
                    paraFrag.appendChild(lineDiv);
                    lineDiv = document.createElement('div');
                    lineDiv.className = 'line';
                    lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
                    remainW = this.maxWidth;
                }
            } else if (item.type === 'element') {
                const elem = item.node;
                const extraWidth = this.getHorizontalExtraWidth(elem);
                const effectiveRemain = remainW - extraWidth;
                if (effectiveRemain <= 0) {
                    // 换行
                    paraFrag.appendChild(lineDiv);
                    lineDiv = document.createElement('div');
                    lineDiv.className = 'line';
                    lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
                    remainW = this.maxWidth;
                    items.unshift(item);
                    continue;
                }
                const {fitted, rest, usedWidth} = this.splitElementByWidth(elem, effectiveRemain, extraWidth);
                if (fitted) {
                    lineDiv.appendChild(fitted);
                    remainW -= usedWidth;
                }
                if (rest) {
                    items.unshift({type: 'element', node: rest});
                    // 换行
                    paraFrag.appendChild(lineDiv);
                    lineDiv = document.createElement('div');
                    lineDiv.className = 'line';
                    lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
                    remainW = this.maxWidth;
                }
            } else if (item.type === 'anno') {
                const annoElem = item.node;
                const fullText = annoElem.textContent;
                if (!fullText.trim()) continue;
                const extraWidth = this.getHorizontalExtraWidth(annoElem);
                const effectiveRemain = remainW - extraWidth;
                if (effectiveRemain <= 0) {
                    // 这种情况几乎不会发生，纯粹为提高鲁棒性而写
                    paraFrag.appendChild(lineDiv);
                    lineDiv = document.createElement('div');
                    lineDiv.className = 'line';
                    lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
                    remainW = this.maxWidth;
                    items.unshift(item);
                    continue;
                }
                const totalLen = fullText.length;
                const annoCharMap = this.buildCharIndexMap(annoElem);
                const {
                    width: wholeWidth,
                    split: wholeSplit
                } = this.getDualWidthAndSplit(annoElem, totalLen, this.noHeading, remainW);
                if (effectiveRemain >= wholeWidth) {
                    const clonedAnno = annoElem.cloneNode(true);
                    const annoSpan = this.insertBrAtGlobalIndex(clonedAnno, wholeSplit, this.buildCharIndexMap(clonedAnno));
                    if (annoSpan) lineDiv.appendChild(annoSpan);
                    remainW -= wholeWidth;
                } else {
                    let bestN = 0;
                    for (let n = 1; n < totalLen; n++) {
                        const {width} = this.getDualWidthAndSplit(annoElem, n, this.noHeading, remainW);
                        if (width <= remainW) bestN = n;
                        else break;
                    }
                    if (bestN === 0) bestN = 1;
                    const {split: innerSplit} = this.getDualWidthAndSplit(annoElem, bestN, this.noHeading, remainW);
                    // 提取前半部分和后半部分（基于 annoElem 和它的字符映射）
                    let frontFrag = this.extractFragment(annoElem, 0, bestN, annoCharMap);
                    let backFrag = this.extractFragment(annoElem, bestN, totalLen, annoCharMap);
                    // 拆分夾批后如果后半部分过短，则将后半部分并入前半部分，避免出现内容极短的单独注释
                    if (backFrag && backFrag.textContent.trim().length <= this.minAnnoChars) {
                        backFrag = null;
                        frontFrag = this.extractFragment(annoElem, 0, totalLen, annoCharMap);
                    }
                    if (frontFrag) {
                        // 拆分夾批后如果前半部分过短，则结束当前行，将前半部分并入后半部分等待处理，避免出现内容极短的单独注释
                        if (frontFrag.textContent.trim().length <= this.minAnnoChars) {
                            paraFrag.appendChild(lineDiv);
                            lineDiv = document.createElement('div');
                            lineDiv.className = 'line';
                            lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
                            remainW = this.maxWidth; // 当前行已满，下一行重置
                            backFrag = this.extractFragment(annoElem, 0, totalLen, annoCharMap);
                            const backSpan = document.createElement('span');
                            backSpan.className = this.annoClass;
                            backSpan.appendChild(backFrag);
                            items.unshift({type: 'anno', node: backSpan});
                        } else {
                            const frontSpan = document.createElement('span');
                            frontSpan.className = this.annoClass;
                            frontSpan.appendChild(frontFrag);
                            // 将innerSplit的范围调整到frontSpan的索引范围以内，防止有内容的frontSpan返回null的annoSpan
                            let insertPos = innerSplit;
                            if (insertPos <= 0) insertPos = 1;
                            if (insertPos >= frontSpan.textContent.length) insertPos = frontSpan.textContent.length - 1;
                            const annoSpan = this.insertBrAtGlobalIndex(frontSpan, insertPos, this.buildCharIndexMap(frontSpan));
                            //  或者简单在文本内容长度1/2处插入br，保护夹注内部DOM结构
                            //  const annoSpan = this.insertBrAtGlobalIndex(frontSpan, frontSpan.textContent.length / 2, this.buildCharIndexMap(frontSpan));
                            if (annoSpan) lineDiv.appendChild(annoSpan)
                            paraFrag.appendChild(lineDiv);
                            lineDiv = document.createElement('div');
                            lineDiv.className = 'line';
                            lineDiv.style.width = `${this.maxWidth + this.rightAdjust}px`;
                            remainW = this.maxWidth; // 当前行已满，下一行重置
                            if (backFrag) {
                                const backSpan = document.createElement('span');
                                backSpan.className = this.annoClass;
                                backSpan.appendChild(backFrag);
                                items.unshift({type: 'anno', node: backSpan});
                            }
                        }
                    }
                }
            }
        }
        if (lineDiv.childNodes.length > 0) paraFrag.appendChild(lineDiv);
        para.replaceChildren(paraFrag);
    }

    // 静态批量初始化工具
    static activate(selector, option={}) {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map(el => new DualAnnoLayout(el, option));
    }
}

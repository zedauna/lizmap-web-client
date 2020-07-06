import { mainLizmap, mainEventDispatcher } from '../modules/Globals.js';
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';

export default class Digitizing {

    constructor() {

        this._tools = ['deactivate', 'point', 'line', 'polygon', 'box', 'circle', 'freehand'];
        this._toolSelected = this._tools[0];

        // Set draw color to value in local storage if any or default (red)
        this._drawColor = localStorage.getItem('drawColor') || '#ff0000';
        this._bufferValue = 0;

        this._featureDrawnVisibility = true;

        this._isEdited = false;

        // Draw tools style
        const drawStyle = new OpenLayers.Style({
            pointRadius: 7,
            fillColor: this._drawColor,
            fillOpacity: 0.2,
            strokeColor: this._drawColor,
            strokeOpacity: 1,
            strokeWidth: 2
        });

        const drawStyleTemp = new OpenLayers.Style({
            pointRadius: 7,
            fillColor: this._drawColor,
            fillOpacity: 0.3,
            strokeColor: this._drawColor,
            strokeOpacity: 1,
            strokeWidth: 3
        });

        const drawStyleSelect = new OpenLayers.Style({
            pointRadius: 7,
            fillColor: 'blue',
            fillOpacity: 0.3,
            strokeColor: 'blue',
            strokeOpacity: 1,
            strokeWidth: 3
        });

        const drawStyleMap = new OpenLayers.StyleMap({
            'default': drawStyle,
            'temporary': drawStyleTemp,
            'select': drawStyleSelect
        });

        this._drawLayer = new OpenLayers.Layer.Vector(
            'drawLayer', {
                styleMap: drawStyleMap
            }
        );

        this._drawLayer.events.on({
            'afterfeaturemodified': () => {
                this.isEdited = false;
            }
        });

        this._bufferLayer = new OpenLayers.Layer.Vector(
            'drawBufferLayer', {
                styleMap: new OpenLayers.StyleMap({
                    fillColor: 'white',
                    fillOpacity: 0,
                    strokeColor: 'blue',
                    strokeOpacity: 1,
                    strokeWidth: 2,
                    strokeDashstyle: 'longdash'
                })
            }
        );

        mainLizmap.lizmap3.map.addLayers([this._drawLayer, this._bufferLayer]);

        const onDrawFeatureAdded = (feature) => {
            /**
             * @todo Ne gère que si il ya a seulement 1 géométrie
             */
            if (feature.layer) {
                if (feature.layer.features.length > 1) {
                    feature.layer.destroyFeatures(feature.layer.features.shift());
                }
            }

            // Handle buffer if any
            this._bufferLayer.destroyFeatures();
            if (this._bufferValue > 0) {
                const geoJSONParser = new OpenLayers.Format.GeoJSON();
                const drawGeoJSON = geoJSONParser.write(feature.geometry);
                const jstsGeoJSONReader = new GeoJSONReader();
                const jstsGeoJSONWriter = new GeoJSONWriter();
                const jstsGeom = jstsGeoJSONReader.read(drawGeoJSON);
                const jstsbBufferedGeom = BufferOp.bufferOp(jstsGeom, this._bufferValue);
                const bufferedDraw = geoJSONParser.read(jstsGeoJSONWriter.write(jstsbBufferedGeom));

                // Draw buffer
                this._bufferLayer.addFeatures(bufferedDraw);
                this._bufferLayer.redraw(true);
            }

            // Save features drawn in localStorage
            this.saveFeatureDrawn();

            mainEventDispatcher.dispatch('digitizing.featureDrawn');

            this.toolSelected = 'deactivate';
        };

        // Disable getFeatureInfo when drawing with clicks
        const drawAndGetFeatureInfoMutuallyExclusive = (event) => {
            if (lizMap.controls.hasOwnProperty('featureInfo') && lizMap.controls.featureInfo){
                if (event.type === 'activate' && lizMap.controls.featureInfo.active) {
                    lizMap.controls.featureInfo.deactivate();
                }
                else if (event.type === 'deactivate' && !lizMap.controls.featureInfo.active) {
                    lizMap.controls.featureInfo.activate();
                }
            }
        };

        /**
         * Point
         * @type @new;OpenLayers.Control.DrawFeature
         */
        this._drawPointLayerCtrl = new OpenLayers.Control.DrawFeature(
            this._drawLayer,
            OpenLayers.Handler.Point,
            {
                'featureAdded': onDrawFeatureAdded,
                styleMap: drawStyleMap,
                eventListeners: {
                    'activate': drawAndGetFeatureInfoMutuallyExclusive,
                    'deactivate': drawAndGetFeatureInfoMutuallyExclusive
                }
            }
        );

        /**
         * Line
         * @type @new;OpenLayers.Control.DrawFeature
         */
        this._drawLineLayerCtrl = new OpenLayers.Control.DrawFeature(
            this._drawLayer,
            OpenLayers.Handler.Path,
            {
                'featureAdded': onDrawFeatureAdded,
                styleMap: drawStyleMap,
                eventListeners: {
                    'activate': drawAndGetFeatureInfoMutuallyExclusive,
                    'deactivate': drawAndGetFeatureInfoMutuallyExclusive
                }
            }
        );

        /**
         * Polygon
         * @type @new;OpenLayers.Control.DrawFeature
         */
        this._drawPolygonLayerCtrl = new OpenLayers.Control.DrawFeature(
            this._drawLayer,
            OpenLayers.Handler.Polygon,
            {
                'featureAdded': onDrawFeatureAdded,
                styleMap: drawStyleMap,
                eventListeners: {
                    'activate': drawAndGetFeatureInfoMutuallyExclusive,
                    'deactivate': drawAndGetFeatureInfoMutuallyExclusive
                }
            }
        );

        /**
         * Box
         * @type @new;OpenLayers.Control.DrawFeature
         */
        this._drawBoxLayerCtrl = new OpenLayers.Control.DrawFeature(this._drawLayer,
            OpenLayers.Handler.RegularPolygon,
            { handlerOptions: { sides: 4, irregular: true }, 'featureAdded': onDrawFeatureAdded }
        );

        /**
         * Circle
         * @type @new;OpenLayers.Control.DrawFeature
         */
        this._drawCircleLayerCtrl = new OpenLayers.Control.DrawFeature(this._drawLayer,
            OpenLayers.Handler.RegularPolygon,
            { handlerOptions: { sides: 40 }, 'featureAdded': onDrawFeatureAdded }
        );

        /**
         * Freehand
         * @type @new;OpenLayers.Control.DrawFeature
         */
        this._drawFreehandLayerCtrl = new OpenLayers.Control.DrawFeature(this._drawLayer,
            OpenLayers.Handler.Polygon, {
            'featureAdded': onDrawFeatureAdded, styleMap: drawStyleMap,
            handlerOptions: { freehand: true }
        });

        this._drawCtrls = [this._drawPointLayerCtrl, this._drawLineLayerCtrl, this._drawPolygonLayerCtrl, this._drawBoxLayerCtrl, this._drawCircleLayerCtrl, this._drawFreehandLayerCtrl];

        this._editCtrl = new OpenLayers.Control.ModifyFeature(this._drawLayer,
            {standalone: true}
        );

        // Add draw and modification controls to map
        mainLizmap.lizmap3.map.addControls(this._drawCtrls);
        mainLizmap.lizmap3.map.addControl(this._editCtrl);

        // Display saved feature if any
        this.savedFeatureDrawnToMap();
    }

    get drawLayer(){
        return this._drawLayer;
    }

    get bufferLayer() {
        return this._bufferLayer;
    }

    get toolSelected() {
        return this._toolSelected;
    }

    set toolSelected(tool) {
        if (this._tools.includes(tool)) {
            // Disable all tools
            for (const drawControl of this._drawCtrls) {
                drawControl.deactivate();
            }

            // If current selected tool is selected again => unactivate
            if(this._toolSelected === tool){
                this._toolSelected = this._tools[0];
            }else{
                switch (tool) {
                    case this._tools[1]:
                        this._drawPointLayerCtrl.activate();
                        break;
                    case this._tools[2]:
                        this._drawLineLayerCtrl.activate();
                        break;
                    case this._tools[3]:
                        this._drawPolygonLayerCtrl.activate();
                        break;
                    case this._tools[4]:
                        this._drawBoxLayerCtrl.activate();
                        break;
                    case this._tools[5]:
                        this._drawCircleLayerCtrl.activate();
                        break;
                    case this._tools[6]:
                        this._drawFreehandLayerCtrl.activate();
                        break;
                }

                this._toolSelected = tool;
            }

            // Disable edition when tool changes
            this.isEdited = false;

            mainEventDispatcher.dispatch('digitizing.toolSelected');
        }
    }

    get drawColor(){
        return this._drawColor;
    }

    set drawColor(color){
        this._drawColor = color;

        // Update default and temporary draw styles
        const drawStyles = this._drawLayer.styleMap.styles;

        drawStyles.default.defaultStyle.fillColor = color;
        drawStyles.default.defaultStyle.strokeColor = color;

        drawStyles.temporary.defaultStyle.fillColor = color;
        drawStyles.temporary.defaultStyle.strokeColor = color;
    }

    get bufferValue(){
        return this._bufferValue;
    }

    set bufferValue(bufferValue){
        this._bufferValue = isNaN(bufferValue) ? 0 : bufferValue;

        mainEventDispatcher.dispatch('digitizing.bufferValue');
    }

    get featureDrawn() {
        if (this._drawLayer.features.length){
            return this._drawLayer.features[0];
        }
        return null;
    }

    get featureDrawnBuffered() {
        if (this._bufferLayer.features.length) {
            return this._bufferLayer.features[0];
        }
        return null;
    }

    get isEdited() {
        return this._isEdited;
    }

    set isEdited(edited) {
        if(this._isEdited != edited){
            this._isEdited = edited;

            if (this._isEdited) {
                this._editCtrl.activate();
                this._editCtrl.selectFeature(this.featureDrawn);
            } else {
                this.saveFeatureDrawn();
                this._editCtrl.deactivate();
            }

            mainEventDispatcher.dispatch('digitizing.edit');
        }
    }

    toggleFeatureDrawnVisibility() {
        this._featureDrawnVisibility = !this._featureDrawnVisibility;

        this._drawLayer.setVisibility(this._featureDrawnVisibility);
        this._bufferLayer.setVisibility(this._featureDrawnVisibility);

        mainEventDispatcher.dispatch('digitizing.featureDrawnVisibility');
    }

    toggleEdit() {
        this.isEdited = !this.isEdited;
    }

    erase() {
        this._drawLayer.destroyFeatures();
        this._bufferLayer.destroyFeatures();

        localStorage.removeItem('drawLayer');
        localStorage.removeItem('bufferLayer');

        this.isEdited = false;

        mainEventDispatcher.dispatch('digitizing.erase');
    }

    saveFeatureDrawn() {
        const formatWKT = new OpenLayers.Format.WKT();

        // Save features in WKT format
        if (this.featureDrawn){
            localStorage.setItem('drawLayer', formatWKT.write(this.featureDrawn));
        }
        if (this.featureDrawnBuffered){
            localStorage.setItem('bufferLayer', formatWKT.write(this.featureDrawnBuffered));
        }

        // Save color
        localStorage.setItem('drawColor', this._drawColor);
    }

    savedFeatureDrawnToMap() {
        const formatWKT = new OpenLayers.Format.WKT();

        const drawLayerWKT = localStorage.getItem('drawLayer');
        const bufferLayerWKT = localStorage.getItem('bufferLayer');

        if (drawLayerWKT){
            this._drawLayer.addFeatures(formatWKT.read(drawLayerWKT));
            this._drawLayer.redraw(true);
        }

        if (bufferLayerWKT){
            this._bufferLayer.addFeatures(formatWKT.read(bufferLayerWKT));
            this._bufferLayer.redraw(true);
        }
    }
}

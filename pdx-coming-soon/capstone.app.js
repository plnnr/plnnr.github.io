// Coming to a Neighborhood near You
// Nick Kobel

///// Process /////
// 1) Initialize page elements
// 2) Determine query
// 3) Call API based on query
// 4) Perform any post-call cleanup, including additional filtering 
// 5) Combine residential and commercial results based on select fields
// 6) Populate result page elements (table)
// 7) Populate map elements based on XY coordinates
// 8) OPTIONAL map legend
// 9) OPTIONAL map popup
// 10) OPTIONAL download results
// 11) OPTIONAL stylize

let resBaseURL = "https://www.portlandmaps.com/arcgis/rest/services/Public/BDS_Permit_Residential_Construction/MapServer/15/"

let myparams = {
    where: "",
    text: "",
    objectIds: "",
    time: "",
    geometry: "",
    geometryType: "esriGeometryEnvelope",
    inSR: "",
    spatialRel: "esriSpatialRelIntersects",
    relationParam: "",
    outFields: "*",
    returnGeometry: "true",
    returnTrueCurves: "false",
    maxAllowableOffset: "",
    geometryPrecision: "",
    outSR: "4326", // WGS 1984 spatial reference to play friendly with google maps and others
    returnIdsOnly: "false",
    returnCountOnly: "false",
    orderByFields: "",
    groupByFieldsForStatistics: "",
    outStatistics: "",
    returnZ: "false",
    returnM: "false",
    gdbVersion: "",
    returnDistinctValues: "false",
    resultOffset: "",
    resultRecordCount: "",
    queryByDistance: "",
    returnExtentsOnly: "false",
    datumTransformation: "",
    parameterValues: "",
    rangeValues: "",
    f: "pjson",
}

// Initialize page elements
const divMapArea = document.querySelector("#mapid");
const buttonSearch = document.querySelector("#search-button");
const formQueryForm = document.querySelector('#query-form');
const inputCheckBoxes = document.querySelectorAll("#dev-type input");

// Initialize map
var mymap = L.map('mapid').setView([45.536951, -122.649971], 11);
L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox.streets',
    accessToken: 'pk.eyJ1IjoibmtvYmVsIiwiYSI6ImJEa05UTkkifQ.5mdRULeaqRUxf8kiozZaZQ'
}).addTo(mymap);


// Get the value of a radio button selected
function getRadioValue(name) {
    const options = document.getElementsByName(name);
    for(let i = 0; i < options.length; i++) {
        if(options[i].checked) {
            return options[i].value
        }
    }
}

// Pad a number with leading zeros
function pad(num, size) {
    let s = num+"";
    while (s.length < size) s = "0" + s
    return s;
};

// Return day/date as text
function getDateText(dateObject) {
    let date = dateObject.getDate();
    let month = dateObject.getMonth()+1;
    let year = dateObject.getFullYear();
    let dateText = `${month}/${date}/${year}`;
    return dateText;
};

// Create an array that stores a date object, a human-readable interpretation, and a SQL-ready query string
function getLookbackCriterion(lookbackSelection) { 
    let returnArray = []; // Create empty array that will take a lookback Date object timestamp, the SQL query-ready format, and a human-readable format
    let oneDay = 24 * 60 * 60 * 1000;
    let now = new Date();
    if (lookbackSelection === "week") {
        returnArray.push(new Date(now - oneDay * 7));
        returnArray.push("7 days");
    } else if (lookbackSelection === "months1") {
        returnArray.push(new Date(now - oneDay * 30));
        returnArray.push("30 days");
    } else if (lookbackSelection === "months3") {
        returnArray.push(new Date(now - oneDay * 30 * 3));
        returnArray.push("90 days");
    } else if (lookbackSelection === "months6") {
        returnArray.push(new Date(now - oneDay * 30 * 6));
        returnArray.push("6 months");
    } else if (lookbackSelection === "months12") {
        returnArray.push(new Date(now - oneDay * 365));
        returnArray.push("12 months");
    } else {
        returnArray.push(new Date(now - (oneDay * 365) + (oneDay * 30 * 6)));
        returnArray.push("18 months");
    }
    let d = returnArray[0];
    let queryString = `DATE '${d.getFullYear()}-${pad(d.getMonth(),2)}-${pad(d.getDate(),2)} 00:00:00'`; //queryString format: "DATE '2018-10-01 00:00:00'"
    returnArray.push(queryString);
    return returnArray;
}

// Get SQL query string for selecting permits with certain status values
function getIssuanceQueryString(lookbackQueryString, statusValue) {
    if (statusValue === "review") {
        return `"INTAKECOMPLETEDATE">=${lookbackQueryString} AND "ISSUED" IS null AND "FINALED" IS null`
    } else if (statusValue === "issued") {
        return `"ISSUED">=${lookbackQueryString} AND "FINALED" IS null`
    } else {
        return `"FINALED">=${lookbackQueryString}`
    }
}

function getIssuanceDate(selectedOptions, featureObject) {
    if (selectedOptions.issuance === "review"){
        let d = new Date(featureObject.INTAKECOMPLETEDATE);
        return getDateText(d)
    } else if (selectedOptions.issuance == "issued") {
        let d = new Date(featureObject.ISSUED);
        return getDateText(d)
    } else if (selectedOptions.issuance == "finaled") {
        let d = new Date(featureObject.FINALED);
        return getDateText(d)
    }
}

// Get SQL query string for finding development types
function getDevTypeQueryString(devList) {
    let queryList = [];
    if (devList.includes("sfr")) {
        queryList.push("Single Family Dwelling")
    }
    if (devList.includes("thrh")) {
        queryList.push("Townhouse (2 Units)", "Townhouse (3 or more units)");
    }
    if (devList.includes("duplex")) {
        queryList.push("Duplex")
    }
    
    let queryString = `"TYPE" IN (`;
    queryList.forEach(function(devtype) {
        queryString += `'${devtype}', `;
    });
    queryString = queryString.slice(0, queryString.length - 2) + ")";
    return queryString;
}

// Build the query parameters for a URL string
function buildQueryParams(params) {
    let paramString = "query?"
    for(key in params) {
        paramString += `${key}=${params[key]}&`
    }
    return paramString//.slice(0, paramString.length - 1)
}

// Build and encode the URL to fetch the data
function buildEncodedURL(base, query) {
    let url = base + query;
    url = encodeURI(url);
    return url;
}


let developments = null;

///////// Main event listener /////////
formQueryForm.addEventListener('submit', function(e) {
    event.preventDefault(e);
    if(developments) {
        developments.clearLayers();
    }

    let selectedOptions = {
        developmentTypes: [],
        issuance: getRadioValue('issuance'),
        lookback: getRadioValue('lookback')
    };
    console.log(selectedOptions);
    inputCheckBoxes.forEach(function(checkbox) {
        if(checkbox.checked) {
            selectedOptions.developmentTypes.push(checkbox.value)
        }
    });

    let devTypeQueryString = getDevTypeQueryString(selectedOptions.developmentTypes);
    let lookbackDate = getLookbackCriterion(selectedOptions.lookback)[2];
    let issuanceQueryString = getIssuanceQueryString(lookbackDate,selectedOptions.issuance);
    let whereString = issuanceQueryString + " AND " + devTypeQueryString;
    myparams.where = whereString;
    let queryParams = buildQueryParams(myparams);
    let fetchURL = buildEncodedURL(resBaseURL, queryParams);

    let reqRes = new XMLHttpRequest(); // request Residential
    reqRes.addEventListener("load", callbackRes);
    reqRes.open("GET", fetchURL);
    reqRes.send();

    // Parse request and populate map
    function callbackRes(e) {
        rspRes = JSON.parse(reqRes.responseText); // response Residential
        console.log(rspRes);

        var developmentMarkers = [];
        // Iterate over responses, pull out relevant attributes
        for (let i=0; i<rspRes.features.length; i++) {
            let feature = rspRes.features[i];
            let fAttributes = feature.attributes;
            let fGeom = feature.geometry;
            let xcoord = fGeom.x;
            let ycoord = fGeom.y;

            let URL = fAttributes.PORTLAND_MAPS_URL;
            let description = fAttributes.DESCRIPTION;
            let devtypeAttr = fAttributes.TYPE;
            let devSqft = fAttributes.TOTALSQFT;

            let houseNumber = fAttributes.HOUSE;
            let stDirection = fAttributes.DIRECTION;
            let stName = fAttributes.PROPSTREET;
            let stType = fAttributes.STREETTYPE;
            let address = "No address";
            if (houseNumber != null) {
                address = `${houseNumber} ${stDirection} ${stName} ${stType}`;
            }
            
            var marker = L.marker([ycoord, xcoord]);
            marker.bindPopup(   `<div class="dev-popup"><h5>${address}</h5>
                                <p><b>Type: </b>${devtypeAttr}</p>
                                <p><b>Status date: </b>${getIssuanceDate(selectedOptions,fAttributes)}</p>
                                <p><b>Square feet: </b>${devSqft}</p>
                                <b>Description:</b></br>
                                <small>${description.toLowerCase()}</small>
                                <p><a href="${URL}">View in Portland Maps</a></p></div>`);
            developmentMarkers.push(marker);
            
        }
        developments = L.layerGroup(developmentMarkers);
        developments.addTo(mymap);
    };
});
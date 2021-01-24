# Arduino Serial Data Viewer

## What is Arduino Serial Data Viewer?
Arduino Serial Data Viewer was created in response to a lack of simple tools that enable rapid bootstrapping and development of data-centric Arduino projects. The core goals of this tool are to:
1. Provide a simple means to visualize serial data output from an Arduino in real-time
2. Facilitate data exporting for down-stream analysis
3. Expand accessibility by wrapping this functionality into a cross-platform and readily available web tool made possible through the current Chrome Web Serial API

The Arduino Serial Data Viewer was built for use together with [`arduino-serial-data-exporter`](https://github.com/lyvewave/arduino-serial-data-exporter), which provides a more streamlined approach to capturing and exporting data collected on an Arduino via serial communication. This library is not required, but data captured using the data viewer is expected in a flat JSON format. More on this below.

## How does it work?
The data viewer tool utilizes the Chrome Web Serial API to connect to your Arduino device. Data received from the Arduino is expected as a stream of JSON objects, with each object packaging any number of variables into a single time point plotted on the chart in real time. Object properties are treated as variable names that are automatically used to name the data series and appear in the chart legend.

Data collection is automatically started when the tool connects to an Arduino and continues until it is disconnected. All data received during that time is plotted on the real time chart. Once the Arduino has been disconnected, and data plotted on the chart can be exported to a CSV for further data analysis. You may also use the `Average` button to perform basic statistical analysis of the data set.

## Getting Started
### Enabling the Arduino Serial Data Viewer web tool
To use Arduino Serial Data Viewer, you must first enable the experimental Web Serial API in Chrome. To do so:
1. Navigate to `chrome://flags` by typing it in the URL bar of Chrome and hitting enter. You will be directed to a section of your Chrome settings.
2. In the search bar at the top, search for `enable-experimental-web-platform-features`.
3. Click on the dropdown to the right under `Experimental Web Platform features` and selected `Enabled`.
4. At the bottom right of the screen, click on `Relaunch` to restart Chrome and apply the new setting.

That's it for the web tool! Now to get your Arduino set up.

### Setting up your Arduino
While not the only way to leverage the data viewer, the recommended approach is to use the [`arduino-serial-data-exporter`](https://github.com/lyvewave/arduino-serial-data-exporter) Arduino library. Check out the link for instructions and examples of how to install and use it. Here's a quick code snippet to demonstrate how simple it is:

```
#include <Arduino.h>
#include "SerialDataExporter.h"

int bufferSizes[] = {255, 3, 2};
SerialDataExporter exporter = SerialDataExporter(Serial, bufferSizes);

void setup() {
  Serial.begin(9600);   // Initialize serial communication
  delay(250);
}

int counter1 = 0;
int counter2 = 1;
double counter3 = 3.1415926;
void loop() {
  exporter.add("x", counter1);  // Export counter1 as a variable named x
  exporter.add("y", counter2);  // Export counter2 as a variable named y
  exporter.add("z", counter3);  // Export counter3 as a variable named z
  exporter.exportJSON();        // Send the data via Serial

  counter1++;
  counter2++;
  counter3++;

  delay(500);
}
```

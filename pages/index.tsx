import React, { ReactElement, useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";

import Alert from "react-bootstrap/Alert";
import Card from "react-bootstrap/Card";
import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Dropdown from "react-bootstrap/Dropdown";
import InputGroup from "react-bootstrap/InputGroup";
import Table from "react-bootstrap/Table";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
import { exec } from "apexcharts";

import { useThrottleFn } from "ahooks";
import { useArduino, UseArduinoOptions } from "hooks/useArduino";
import {
  useArduinoCreateAgent,
  ArduinoDeviceList,
} from "hooks/useArduinoCreateAgent";
import styles from "./index.module.scss";

type DataSeries = { name?: string; data: { x: number; y: number }[] }[];
type DataStats = { name: string; mean: number; stdev: number }[];

declare global {
  interface Window {
    ApexCharts: {
      exec: typeof exec;
    };
  }
}

/**
 * Interval at which the chart is updated. Note that data received within this
 * interval is still captured and stored, but not plotted on the chart.
 */
const CHART_UPDATE_INTERVAL = 250;

/**
 * The number of samples that are visible on the chart at any given time.
 * Samples that fall outside of this window are still plotted, but are
 * offscreen.
 */
const WINDOW_SIZE = 100;

const CHART_OPTIONS = {
  chart: {
    id: "line-chart",
    type: "line",
    width: 600,
    height: 350,
    offsetX: 10,
    animations: {
      enabled: true,
      speed: CHART_UPDATE_INTERVAL,
      easing: "linear",
      dynamicAnimation: {
        speed: CHART_UPDATE_INTERVAL,
      },
    },
    toolbar: {
      show: true,
      tools: {
        download: false,
      },
    },
  },
  legend: {
    show: true,
    position: "top",
    showForSingleSeries: false,
    floating: true,
  },
  dataLabels: { enabled: false },
  stroke: {
    curve: "straight",
    width: 2.5,
  },
  title: {
    align: "center",
  },
  markers: { size: 0 },
  grid: { show: false },
  yaxis: {
    title: {
      text: "Value",
      style: {
        color: "#444",
        cssClass: styles.axisTitle,
      },
    },
    axisBorder: {
      show: true,
      color: "#ccc",
      offsetX: 0,
      offsetY: 0,
      width: 0.75,
    },
  },
  xaxis: {
    type: "numeric",
    title: {
      text: "Sample",
      offsetY: 10,
      style: {
        color: "#444",
        cssClass: styles.axisTitle,
      },
    },
    tickAmount: 10,
    axisBorder: {
      show: true,
      color: "#ccc",
      offsetX: 0,
      offsetY: 0,
      height: 0.75,
    },
    min: 0,
    max: 10,
  },
};

const Index = (): ReactElement => {
  const serialData = useRef<string[]>([]);
  const [protocol, setProtocol] = useState<"serial" | "agent" | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [agentDevices, setAgentDevices] = useState<ArduinoDeviceList | null>(
    null
  );

  /** The current chart data. */
  const chartDataRef = useRef<DataSeries>([]);
  const chartData = chartDataRef.current;

  /**
   * Stores the current collection of series for the plot. A new series is
   * created for each unique variable name that is received from the serial
   * data. A unique index is stored in this map for each series so that data
   * index order for the chart is maintained even when data for a particular
   * variable is only provided intermitently.
   */
  const series = useRef<Map<string, number>>(new Map()).current;

  /** Stores a set of statistics generated for the current data set. */
  const [statistics, setStatistics] = useState<DataStats>([]);

  const { run: updateChartData } = useThrottleFn(
    (jsonString: string, index: number): void => {
      try {
        const data = JSON.parse(jsonString);

        Object.keys(data).forEach((key) => {
          if (!series.has(key)) {
            series.set(key, series.size);
            window.ApexCharts.exec("line-chart", "appendSeries", {
              name: key,
              data: [],
            });

            chartData.push({
              name: key,
              data: [],
            });
          }

          const seriesIndex = series.get(key);
          if (seriesIndex !== undefined) {
            chartData[seriesIndex].data.push({ x: index, y: data[key] });
          }
        });

        window.ApexCharts.exec("line-chart", "updateOptions", {
          xaxis: {
            min: Math.max(0, index - WINDOW_SIZE),
            max: index,
          },
          series: chartData,
        });
      } catch (error) {
        console.log("Error parsing JSON data:", jsonString);
      }
    },
    { wait: CHART_UPDATE_INTERVAL }
  );

  const options: UseArduinoOptions = {
    readDelimiter: "\n",
    onRead: (value) => {
      serialData.current.push(value);
      updateChartData(value, serialData.current.length - 1);
    },
  };

  const serialArduino = useArduino(options);
  const agentArduino = useArduinoCreateAgent(options);

  const status =
    protocol === "agent" ? agentArduino.status : serialArduino.status;

  // Determine whether the arduino devices are available through the web serial
  // API or if we need to fall back to Arduino Create Agent.
  useEffect(() => {
    if (protocol === null) {
      serialArduino.isAvailable().then(async (available) => {
        if (available) {
          setProtocol("serial");
        } else {
          const devices = await agentArduino.fetchDevices();

          // Display alert if devices is null as this indicates that the
          // Arduino Create Agent was unavailable.
          if (devices === null) {
            setShowAlert(true);
          }

          setProtocol("agent");
          setAgentDevices(devices);
        }
      });
    }
  }, [serialArduino]);

  // Handles when the user selects a specific device to connect to through the
  // Arduino Create Agent
  const handleDeviceSelected = (eventKey: string | null): void => {
    if (eventKey === null) return;
    setSelectedDevice(eventKey);
  };

  const handleConnect = async (): Promise<void> => {
    if (status === "connected" || protocol === null) return;

    if (protocol === "serial") {
      await serialArduino.connect(9600);
    } else if (agentDevices && selectedDevice) {
      await agentArduino.connect(agentDevices[selectedDevice], 9600);
    } else {
      return;
    }

    // Clear the current data if there is any
    if (serialData.current.length > 0) {
      handleClear();
    }

    window.ApexCharts.exec("line-chart", "updateOptions", {
      chart: {
        animations: { enabled: true },
      },
    });
  };

  const handleDisconnect = (): void => {
    if (status === "disconnected") return;

    protocol === "serial"
      ? serialArduino.disconnect()
      : agentArduino.disconnect();

    // Update chart data to include the full high resolution data set received
    // from the arduino, since real-time chart updates and data parsing are
    // throttled.
    const highResData: DataSeries = [];
    const entries = Array.from(series.entries()).sort(
      (e1, e2) => e1[1] - e2[1]
    );
    entries.forEach((entry) => {
      highResData.push({
        name: entry[0],
        data: [],
      });
    });

    serialData.current.forEach((jsonValue, dataIndex) => {
      try {
        const dataObject = JSON.parse(jsonValue);
        entries.forEach(([seriesKey, seriesIndex]) => {
          if (typeof dataObject[seriesKey] !== "undefined") {
            highResData[seriesIndex].data.push({
              x: dataIndex,
              y: dataObject[seriesKey],
            });
          }
        });
      } catch (error) {
        console.log("Error parsing JSON data:", jsonValue);
      }
    });

    chartDataRef.current = highResData;

    window.ApexCharts.exec("line-chart", "updateOptions", {
      chart: {
        animations: { enabled: false },
      },
      series: highResData,
    });
  };

  const handleClear = (): void => {
    serialData.current = [];
    chartDataRef.current = [];
    series.clear();

    window.ApexCharts.exec("line-chart", "updateOptions", {
      xaxis: {
        min: CHART_OPTIONS.xaxis.min,
        max: CHART_OPTIONS.xaxis.max,
      },
    });

    setStatistics([]);
  };

  const exportToCSV = (): void => {
    let csvData = "data:text/csv;charset=utf-8,sample,";

    // Print headers
    const entries = Array.from(series.entries()).sort(
      (e1, e2) => e1[1] - e2[1]
    );
    csvData += entries.map((entry) => entry[0]).join(",") + "\n";

    serialData.current.forEach((jsonValue, index) => {
      try {
        const dataObject = JSON.parse(jsonValue);
        const rowData: (string | number)[] = [index];
        entries.forEach(([seriesKey]) => {
          typeof dataObject === "undefined"
            ? rowData.push("")
            : rowData.push(dataObject[seriesKey]);
        });

        csvData += rowData.join(",") + "\n";
      } catch (error) {
        console.log("Error parsing JSON data:", error);
      }
    });

    const encodedUri = encodeURI(csvData);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "data.csv");

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
  };

  const calculateStatistics = (): void => {
    const entries = Array.from(series.entries()).sort(
      (e1, e2) => e1[1] - e2[1]
    );

    const dataStats: DataStats = chartData.map((seriesData, index) => {
      const numSamples = seriesData.data.length;
      const mean = seriesData.data.reduce<number>(
        (acc, { y }) => acc + y / numSamples,
        0
      );
      const stdev = Math.sqrt(
        seriesData.data.reduce<number>(
          (acc, { y }) => acc + Math.pow(y - mean, 2),
          0
        ) / numSamples
      );

      return {
        name: entries[index][0],
        mean,
        stdev,
      };
    });

    setStatistics(dataStats);
  };

  const connectButton =
    protocol !== "agent" ? (
      <Button onClick={handleConnect} disabled={protocol === null}>
        Connect
      </Button>
    ) : (
      <Dropdown as={ButtonGroup} onSelect={handleDeviceSelected}>
        <Button onClick={handleConnect} disabled={selectedDevice === null}>
          Connect
        </Button>
        <Dropdown.Toggle split id="agent-devices" />
        <Dropdown.Menu>
          {agentDevices &&
            Object.keys(agentDevices).map((device) => (
              <Dropdown.Item
                key={device}
                eventKey={device}
                className={
                  selectedDevice === device ? styles.selectedDevice : undefined
                }
              >
                {device}
              </Dropdown.Item>
            ))}
        </Dropdown.Menu>
      </Dropdown>
    );

  return (
    <Container className={styles.Index}>
      {showAlert && (
        <Row>
          <Col>
            <Alert variant="warning">
              Uh oh! Looks like you may need to{" "}
              <Alert.Link
                href="https://create.arduino.cc/getting-started/plugin/welcome"
                target="_blank"
                rel="noopener noreferrer"
              >
                install
              </Alert.Link>{" "}
              or adjust the settings for Arduino Create Agent. For more
              information, click{" "}
              <Alert.Link
                href="https://github.com/lyvewave/arduino-serial-data-viewer#arduino-create-agent"
                target="_blank"
                rel="noopener noreferrer"
              >
                here
              </Alert.Link>
              .
            </Alert>
          </Col>
        </Row>
      )}
      <Row>
        <Col>
          <h1>Arduino Serial Data Viewer</h1>
        </Col>
      </Row>
      <Row>
        <Col>
          <Card className={styles.chartArea}>
            <Card.Body>
              <Chart
                options={CHART_OPTIONS}
                series={chartData}
                width={CHART_OPTIONS.chart.width}
                height={CHART_OPTIONS.chart.height}
              />
            </Card.Body>
          </Card>
        </Col>
        <Col>
          <Card className={styles.controlPanel}>
            <Card.Body>
              <InputGroup className={styles.statusIndicator}>
                <InputGroup.Text>
                  <span className={styles.statusLabel}>Status:</span>
                  <span
                    className={`${styles.status} ${
                      status === "disconnected" ? "text-danger" : "text-success"
                    }`}
                  >
                    {status}
                  </span>
                </InputGroup.Text>
                <InputGroup.Append>
                  {status === "disconnected" ? (
                    connectButton
                  ) : (
                    <Button onClick={handleDisconnect}>Disconnect</Button>
                  )}
                </InputGroup.Append>
              </InputGroup>

              <Button
                onClick={handleClear}
                disabled={serialData.current.length === 0}
              >
                Clear Data
              </Button>
              <Button
                onClick={exportToCSV}
                disabled={serialData.current.length === 0}
              >
                Export to CSV
              </Button>
              <Button
                onClick={calculateStatistics}
                disabled={serialData.current.length === 0}
              >
                Statistics
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {statistics.length > 0 && (
        <Row>
          <Col>
            <Card className={styles.statistics}>
              <Card.Body>
                <h2>Statistics</h2>
                <Table striped>
                  <thead>
                    <tr>
                      <th>Variable</th>
                      <th>Mean</th>
                      <th>Stdev</th>
                      <th>RSD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics.map(({ name, mean, stdev }) => {
                      const rsd = (stdev / mean) * 100;
                      return (
                        <tr key={`row-${name}`}>
                          <td>{name}</td>
                          <td>{mean.toFixed(3)}</td>
                          <td>{stdev.toFixed(3)}</td>
                          <td>{rsd.toFixed(3)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </Container>
  );
};

export default Index;

import React, {
  ReactElement,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import dynamic from "next/dynamic";

import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Button from "react-bootstrap/Button";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
import type * as ApexChartsType from "apexcharts";

import { useThrottleFn, useSet } from "ahooks";
import { useArduino } from "hooks/useArduino";
import styles from "./index.module.scss";
type DataSeries = { data: number[] }[];

declare global {
  interface Window {
    ApexCharts: ApexChartsType;
  }
}

/**
 * Interval at which the chart is updated. Note that data received within this
 * interval is still captured and stored, but not plotted on the chart.
 */
const CHART_UPDATE_INTERVAL = 250;

const Index = (): ReactElement => {
  const serialData = useRef<string[]>([]);
  const [series, { add: addToSeries, has: seriesHas }] = useSet<string>([]);

  const { run: updateChartData } = useThrottleFn(
    useCallback(
      (jsonString: string): void => {
        try {
          const data = JSON.parse(jsonString);
          const appendData: DataSeries = [];

          Object.keys(data).forEach((key) => {
            if (!seriesHas(key)) {
              addToSeries(key);
              window.ApexCharts.exec("line-chart", "appendSeries", {
                name: key,
                data: [],
              });
            }

            appendData.push({ data: [data[key]] });
          });

          window.ApexCharts.exec("line-chart", "appendData", appendData);
        } catch (error) {
          console.log("Error parsing data:", error);
        }
      },
      [addToSeries, seriesHas]
    ),
    { wait: CHART_UPDATE_INTERVAL }
  );

  const { connect, disconnect, status } = useArduino({
    readDelimiter: "\n",
    onRead: (value) => {
      serialData.current.push(value);
      updateChartData(value);
    },
  });

  const handleConnect = (): void => {
    if (status === "connected") return;
    connect(9600);
  };

  const handleDisconnect = (): void => {
    if (status === "disconnected") return;
    disconnect();
  };

  const chartOptions = {
    chart: {
      id: "line-chart",
      type: "line",
      width: 900,
      height: 600,
      animations: {
        enabled: true,
        speed: CHART_UPDATE_INTERVAL * 2, // Results in smoother animation
        easing: "linear",
        dynamicAnimation: {
          speed: CHART_UPDATE_INTERVAL * 2, // Results in smoother animation
        },
      },
    },
    legend: {
      show: true,
      floating: true,
      showForSingleSeries: false,
      width: 900,
      height: 50,
    },
    dataLabels: { enabled: false },
    stroke: {
      curve: "straight",
      width: 2.5,
    },
    title: {
      text: "Arduino Output",
      align: "center",
    },
    markers: { size: 0 },
    grid: { show: false },
    yaxis: {
      axisBorder: {
        show: true,
        color: "#ccc",
        offsetX: 0,
        offsetY: 0,
        width: 0.75,
      },
    },
    xaxis: {
      tickAmount: 10,
      axisBorder: {
        show: true,
        color: "#ccc",
        offsetX: 0,
        offsetY: 0,
        height: 0.75,
      },
    },
  };

  const chartData: DataSeries = [];
  if (serialData.current.length > 0) {
    series.forEach((seriesKey) => {
      chartData.push({
        name: seriesKey,
        data: [],
      });
    });

    serialData.current.forEach((jsonValue) => {
      try {
        const dataObject = JSON.parse(jsonValue);
        let index = 0;
        series.forEach((seriesKey) => {
          chartData[index++].data.push(dataObject[seriesKey]);
        });
      } catch (error) {
        console.log("Error parsing JSON data:", error);
      }
    });
  }

  return (
    <Container className={styles.Index}>
      <Row>
        <Col>
          <Button onClick={handleConnect}>Connect</Button>
          <Button onClick={handleDisconnect}>Disconnect</Button>
        </Col>
      </Row>
      <Row>
        <Col>
          <Chart
            options={chartOptions}
            series={chartData}
            width={900}
            height={600}
          />
        </Col>
      </Row>
    </Container>
  );
};

export default Index;

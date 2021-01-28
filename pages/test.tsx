import React, { ReactElement } from "react";
import { useArduinoCreateAgent } from "hooks/useArduinoCreateAgent";

const Test = (): ReactElement => {
  const { status, fetchDevices, connect } = useArduinoCreateAgent({
    readDelimiter: "\n",
    onRead: (value) => {
      console.log(value);
    },
  });

  if (status === "disconnected") {
    (async () => {
      const devices = await fetchDevices();
      if (!devices) {
        console.log("Error connection to Arduino Create Agent");
        return;
      }

      const keys = Object.keys(devices);
      if (keys.length === 0) {
        console.log("No devices found");
        return;
      }

      await connect(devices[keys[0]], 9600);
    })();
  }

  return (
    <div>
      <span> This is a test</span>
    </div>
  );
};

export default Test;

import React, { ReactElement } from "react";

import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";

import Button from "react-bootstrap/Button";

import { useArduino } from "hooks/useArduino";

import styles from "./index.module.scss";

const Index = (): ReactElement => {
  const { connect, disconnect, status } = useArduino({
    readDelimiter: "\n",
    onRead: (value) => {
      console.log("Read:", value);
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

  return (
    <Container className={styles.Index}>
      <Row>
        <Col>
          <Button onClick={handleConnect}>Connect</Button>
          <Button onClick={handleDisconnect}>Disconnect</Button>
        </Col>
      </Row>
    </Container>
  );
};

export default Index;

import React, { ReactElement } from "react";
import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";

import styles from "./index.module.scss";

const Index = (): ReactElement => {
  return (
    <Container className={styles.Index}>
      <Row>
        <Col>Home</Col>
      </Row>
    </Container>
  );
};

export default Index;

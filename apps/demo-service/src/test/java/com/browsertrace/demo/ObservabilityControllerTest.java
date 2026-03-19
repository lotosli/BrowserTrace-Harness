package com.browsertrace.demo;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

@SpringBootTest
@AutoConfigureMockMvc
class ObservabilityControllerTest {
  @Autowired
  private MockMvc mockMvc;

  @Test
  void serviceGraphEndpointResponds() throws Exception {
    var response = mockMvc.perform(MockMvcRequestBuilders.get("/api/servicegraph"))
        .andReturn()
        .getResponse();
    assertThat(response.getStatus()).isEqualTo(200);
    assertThat(response.getContentAsString()).contains("order-service");
  }
}


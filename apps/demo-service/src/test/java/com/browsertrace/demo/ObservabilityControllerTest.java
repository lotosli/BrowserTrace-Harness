package com.browsertrace.demo;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
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

  @Test
  void demoAppsEndpointResponds() throws Exception {
    var response = mockMvc.perform(MockMvcRequestBuilders.get("/api/demo/options/apps"))
        .andReturn()
        .getResponse();
    assertThat(response.getStatus()).isEqualTo(200);
    assertThat(response.getContentAsString()).contains("orders");
    assertThat(response.getContentAsString()).contains("billing");
  }

  @Test
  void demoScenarioBadRequestRespondsWithStructuredJson() throws Exception {
    var response = mockMvc.perform(
            MockMvcRequestBuilders.post("/api/demo/run")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"appId":"orders","scenarioId":"bad_request"}
                    """)
        )
        .andReturn()
        .getResponse();
    assertThat(response.getStatus()).isEqualTo(400);
    assertThat(response.getContentAsString()).contains("\"ok\":false");
    assertThat(response.getContentAsString()).contains("缺少业务过滤条件");
  }

  @Test
  void demoScenarioBadPayloadStillReturns200() throws Exception {
    var response = mockMvc.perform(
            MockMvcRequestBuilders.post("/api/demo/run")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"appId":"orders","scenarioId":"bad_payload"}
                    """)
        )
        .andReturn()
        .getResponse();
    assertThat(response.getStatus()).isEqualTo(200);
    assertThat(response.getContentAsString()).contains("\"status\":\"ok\"");
    assertThat(response.getContentAsString()).doesNotContain("\"ok\":true");
  }
}

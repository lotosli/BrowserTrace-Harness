package com.browsertrace.demo.app;

import com.browsertrace.demo.service.ServiceGraphService;
import java.security.Principal;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ObservabilityController {
  private static final Logger log = LoggerFactory.getLogger(ObservabilityController.class);
  private final ServiceGraphService serviceGraphService;

  public ObservabilityController(ServiceGraphService serviceGraphService) {
    this.serviceGraphService = serviceGraphService;
  }

  @GetMapping(path = "/api/me", produces = MediaType.APPLICATION_JSON_VALUE)
  public Map<String, String> me(Principal principal) {
    log.info("Returning demo user profile");
    return Map.of(
        "name", principal != null ? principal.getName() : "browsertrace-user",
        "role", "developer"
    );
  }

  @GetMapping(path = "/api/servicegraph", produces = MediaType.APPLICATION_JSON_VALUE)
  public Map<String, Object> serviceGraph(@RequestParam(defaultValue = "order-service") String service) {
    log.info("Received service graph request for {}", service);
    return serviceGraphService.describe(service);
  }

  @GetMapping(path = "/api/echo", produces = MediaType.APPLICATION_JSON_VALUE)
  public Map<String, String> echo(@RequestParam(defaultValue = "hello") String value) {
    log.info("Echo request received");
    return Map.of("value", value);
  }
}


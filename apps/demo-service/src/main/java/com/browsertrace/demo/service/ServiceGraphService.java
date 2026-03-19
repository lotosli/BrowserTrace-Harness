package com.browsertrace.demo.service;

import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ServiceGraphService {
  private static final Logger log = LoggerFactory.getLogger(ServiceGraphService.class);

  public Map<String, Object> describe(String serviceName) {
    log.info("Generating service graph payload for {}", serviceName);
    return Map.of(
        "service", serviceName,
        "status", "ok",
        "updatedAt", Instant.now().toString(),
        "dependencies", new String[]{"inventory-service", "payment-service"}
    );
  }
}


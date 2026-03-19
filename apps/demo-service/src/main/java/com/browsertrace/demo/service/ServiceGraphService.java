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
    String normalizedServiceName = normalizeServiceName(serviceName);
    String[] dependencies = resolveDependencies(normalizedServiceName);
    String health = resolveHealth(normalizedServiceName);
    log.info("Generating service graph payload for {}", serviceName);
    return composeGraph(normalizedServiceName, dependencies, health);
  }

  public String normalizeServiceName(String serviceName) {
    return serviceName == null || serviceName.isBlank() ? "unknown-service" : serviceName.trim();
  }

  public String[] resolveDependencies(String serviceName) {
    if (serviceName.contains("billing")) {
      return new String[]{"ledger-service", "fraud-service"};
    }
    return new String[]{"inventory-service", "payment-service"};
  }

  public String resolveHealth(String serviceName) {
    return serviceName.contains("degraded") ? "degraded" : "ok";
  }

  public Map<String, Object> composeGraph(String serviceName, String[] dependencies, String health) {
    return Map.of(
        "service", serviceName,
        "status", health,
        "updatedAt", Instant.now().toString(),
        "dependencies", dependencies
    );
  }
}

package com.browsertrace.demo.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class BaggageMdcFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain
  ) throws ServletException, IOException {
    try {
      var baggageHeader = request.getHeader("baggage");
      if (baggageHeader != null && !baggageHeader.isBlank()) {
        Map<String, String> values = Arrays.stream(baggageHeader.split(","))
            .map(String::trim)
            .filter(entry -> entry.contains("="))
            .map(entry -> entry.split("=", 2))
            .collect(Collectors.toMap(
                parts -> parts[0],
                parts -> URLDecoder.decode(parts[1], StandardCharsets.UTF_8),
                (left, right) -> right
            ));
        map(values, "spec.id", "spec_id");
        map(values, "run.id", "run_id");
        map(values, "page.url", "page_url");
      }
      filterChain.doFilter(request, response);
    } finally {
      MDC.remove("spec_id");
      MDC.remove("run_id");
      MDC.remove("page_url");
    }
  }

  private void map(Map<String, String> values, String sourceKey, String targetKey) {
    var value = values.get(sourceKey);
    if (value != null) {
      MDC.put(targetKey, value);
    }
  }
}


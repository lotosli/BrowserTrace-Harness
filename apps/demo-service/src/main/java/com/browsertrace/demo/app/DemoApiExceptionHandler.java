package com.browsertrace.demo.app;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class DemoApiExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(DemoApiExceptionHandler.class);

  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException exception, HttpServletRequest request) {
    HttpStatus status = HttpStatus.valueOf(exception.getStatusCode().value());
    return ResponseEntity.status(status).body(Map.of(
        "ok", false,
        "status", status.value(),
        "error", status.getReasonPhrase(),
        "message", exception.getReason() != null ? exception.getReason() : status.getReasonPhrase(),
        "path", request.getRequestURI(),
        "timestamp", Instant.now().toString()
    ));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleUnexpected(Exception exception, HttpServletRequest request) {
    log.error("Demo API failed", exception);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
        "ok", false,
        "status", 500,
        "error", "Internal Server Error",
        "message", exception.getMessage() != null ? exception.getMessage() : "Unexpected server error",
        "path", request.getRequestURI(),
        "timestamp", Instant.now().toString()
    ));
  }
}

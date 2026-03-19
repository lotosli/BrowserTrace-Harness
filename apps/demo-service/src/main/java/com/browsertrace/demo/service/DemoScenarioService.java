package com.browsertrace.demo.service;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DemoScenarioService {
  private final ServiceGraphService serviceGraphService;

  public DemoScenarioService(ServiceGraphService serviceGraphService) {
    this.serviceGraphService = serviceGraphService;
  }

  public DemoPagePayload page() {
    return new DemoPagePayload(
        "BrowserTrace React Demo",
        "两个下拉框都从 Java 后端拉取，包含成功和常见错误场景。",
        "orders"
    );
  }

  public List<DemoAppOption> listApps() {
    return List.of(
        new DemoAppOption("orders", "订单模块", "包含订单查询、依赖图和常见异常场景"),
        new DemoAppOption("billing", "支付模块", "包含支付资料、依赖图和常见异常场景")
    );
  }

  public List<DemoScenarioOption> listScenarios(String appId) {
    ensureSupportedApp(appId);
    return List.of(
        new DemoScenarioOption("profile_ok", "200 正确: 用户资料", "200", "返回标准成功 JSON"),
        new DemoScenarioOption("servicegraph_ok", "200 正确: 服务依赖", "200", "返回依赖图和更新时间"),
        new DemoScenarioOption("bad_request", "400 参数错误", "400", "模拟前端传参不完整"),
        new DemoScenarioOption("not_found", "404 资源不存在", "404", "模拟请求到不存在资源"),
        new DemoScenarioOption("server_error", "500 服务内部错误", "500", "模拟后端依赖异常"),
        new DemoScenarioOption("slow_timeout", "客户端超时", "timeout", "后端故意慢响应，由前端超时报错"),
        new DemoScenarioOption("bad_payload", "200 结构错误", "200-invalid-schema", "HTTP 200 但返回结构不符合预期")
    );
  }

  public Object runScenario(DemoRunRequest request, HttpServletRequest httpRequest) throws InterruptedException {
    ensureSupportedApp(request.appId());
    String scenarioId = request.scenarioId();
    DemoDiagnostics diagnostics = diagnostics(httpRequest);

    return switch (scenarioId) {
      case "profile_ok" -> new DemoSuccessResponse(
          true,
          request.appId(),
          scenarioId,
          "已返回用户资料。",
          Map.of(
              "module", request.appId(),
              "user", Map.of("id", "demo-user", "name", "BrowserTrace User", "role", "developer"),
              "updatedAt", Instant.now().toString()
          ),
          diagnostics
      );
      case "servicegraph_ok" -> new DemoSuccessResponse(
          true,
          request.appId(),
          scenarioId,
          "已返回服务依赖图。",
          Map.of(
              "module", request.appId(),
              "graph", serviceGraphService.describe(request.appId() + "-service")
          ),
          diagnostics
      );
      case "bad_request" -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "缺少业务过滤条件，无法处理请求。");
      case "not_found" -> throw new ResponseStatusException(HttpStatus.NOT_FOUND, "请求的业务资源不存在。");
      case "server_error" -> throw new IllegalStateException("模拟的后端依赖异常。");
      case "slow_timeout" -> {
        Thread.sleep(2500L);
        yield new DemoSuccessResponse(
            true,
            request.appId(),
            scenarioId,
            "该响应会晚于前端超时时间返回。",
            Map.of(
                "module", request.appId(),
                "completedAt", Instant.now().toString()
            ),
            diagnostics
        );
      }
      case "bad_payload" -> Map.of(
          "status", "ok",
          "module", request.appId(),
          "scenarioId", scenarioId,
          "message", "故意返回不符合前端预期的结构。",
          "diagnostics", diagnostics
      );
      default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的场景: " + scenarioId);
    };
  }

  private DemoDiagnostics diagnostics(HttpServletRequest request) {
    return new DemoDiagnostics(
        headerValue(request, "traceparent"),
        headerValue(request, "baggage"),
        headerValue(request, "x-request-id")
    );
  }

  private String headerValue(HttpServletRequest request, String headerName) {
    String value = request.getHeader(headerName);
    return value != null ? value : "";
  }

  private void ensureSupportedApp(String appId) {
    boolean supported = listApps().stream().anyMatch(option -> option.id().equals(appId));
    if (!supported) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的模块: " + appId);
    }
  }

  public record DemoPagePayload(String title, String subtitle, String defaultAppId) {}

  public record DemoAppOption(String id, String label, String description) {}

  public record DemoScenarioOption(String id, String label, String expectedStatus, String description) {}

  public record DemoRunRequest(String appId, String scenarioId) {}

  public record DemoDiagnostics(String traceparent, String baggage, String requestId) {}

  public record DemoSuccessResponse(
      boolean ok,
      String appId,
      String scenarioId,
      String message,
      Object data,
      DemoDiagnostics diagnostics
  ) {}
}

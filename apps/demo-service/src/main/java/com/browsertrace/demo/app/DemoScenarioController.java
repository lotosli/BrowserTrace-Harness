package com.browsertrace.demo.app;

import com.browsertrace.demo.service.DemoScenarioService;
import com.browsertrace.demo.service.DemoScenarioService.DemoRunRequest;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/demo", produces = MediaType.APPLICATION_JSON_VALUE)
public class DemoScenarioController {
  private static final Logger log = LoggerFactory.getLogger(DemoScenarioController.class);
  private final DemoScenarioService demoScenarioService;

  public DemoScenarioController(DemoScenarioService demoScenarioService) {
    this.demoScenarioService = demoScenarioService;
  }

  @GetMapping("/page")
  public DemoScenarioService.DemoPagePayload page() {
    log.info("Loading demo page metadata");
    return demoScenarioService.page();
  }

  @GetMapping("/options/apps")
  public List<DemoScenarioService.DemoAppOption> appOptions() {
    log.info("Loading demo app options");
    return demoScenarioService.listApps();
  }

  @GetMapping("/options/scenarios")
  public List<DemoScenarioService.DemoScenarioOption> scenarioOptions(@RequestParam String appId) {
    log.info("Loading demo scenarios for {}", appId);
    return demoScenarioService.listScenarios(appId);
  }

  @PostMapping(path = "/run", consumes = MediaType.APPLICATION_JSON_VALUE)
  public Object runScenario(@RequestBody DemoRunRequest request, HttpServletRequest httpRequest) throws InterruptedException {
    log.info("Running demo scenario {} for {}", request.scenarioId(), request.appId());
    return demoScenarioService.runScenario(request, httpRequest);
  }
}

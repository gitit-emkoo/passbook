const { withGradleProperties, withProjectBuildGradle, withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Kotlin 버전을 1.9.25로 설정하는 Expo Config Plugin
 * 정식 호환 버전으로 설정하여 Compose Compiler 1.5.15와 호환성 문제 해결
 * 
 * 해결 방법:
 * 1. settings.gradle의 pluginManagement 블록 제거 (Expo 기본 형태로 복원)
 * 2. 루트 build.gradle에서만 Kotlin 버전 1.9.25 지정 (plugins DSL 또는 buildscript/ext 방식)
 * 3. 서브프로젝트의 직접 버전 지정 제거
 * 4. 우회 플래그 제거
 */
const withKotlinVersion = (config) => {
  // 1. gradle.properties에 Kotlin 버전 설정 추가
  config = withGradleProperties(config, (config) => {
    const existingProps = config.modResults || [];
    
    const kotlinVersionProp = existingProps.find(
      (prop) => prop.key === 'kotlinVersion'
    );
    
    if (!kotlinVersionProp) {
      config.modResults.push({
        type: 'property',
        key: 'kotlinVersion',
        value: '1.9.25',
      });
    } else {
      kotlinVersionProp.value = '1.9.25';
    }
    
    return config;
  });
  
  // 2. settings.gradle의 pluginManagement 블록 제거 (Expo 기본 형태로 복원)
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const settingsGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'settings.gradle'
      );
      
      if (fs.existsSync(settingsGradlePath)) {
        let contents = fs.readFileSync(settingsGradlePath, 'utf8');
        
        // pluginManagement 블록 전체 제거
        // 단, Expo 기본 형태의 pluginManagement는 유지 (repositories만 있고 plugins가 없는 경우)
        const pluginManagementRegex = /pluginManagement\s*\{[\s\S]*?\n\}/g;
        
        if (contents.match(pluginManagementRegex)) {
          // pluginManagement 블록이 있는 경우
          const matches = contents.match(pluginManagementRegex);
          matches.forEach(match => {
            // plugins 블록이 있는 경우만 제거 (커스텀 코드)
            if (match.includes('plugins {') || match.includes('id("org.jetbrains.kotlin.android")')) {
              contents = contents.replace(match, '').trim();
            }
          });
        }
        
        // 여러 빈 줄 정리
        contents = contents.replace(/\n{3,}/g, '\n\n');
        
        fs.writeFileSync(settingsGradlePath, contents, 'utf8');
      }
      
      return config;
    },
  ]);
  
  // 3. 루트 build.gradle에서 Kotlin 버전 설정
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      let contents = config.modResults.contents;
      
      // 먼저 plugins DSL 방식 확인
      const pluginsBlockRegex = /plugins\s*\{([^}]*)\}/s;
      const hasPluginsBlock = contents.match(pluginsBlockRegex);
      
      if (hasPluginsBlock) {
        // plugins DSL 방식 사용
        let pluginsContent = hasPluginsBlock[1];
        
        // org.jetbrains.kotlin.android 플러그인이 있는지 확인
        if (pluginsContent.includes('org.jetbrains.kotlin.android')) {
          // 기존 버전을 1.9.25로 교체
          pluginsContent = pluginsContent.replace(
            /id\s+['"]org\.jetbrains\.kotlin\.android['"]\s+version\s+['"]([^'"]+)['"]/g,
            "id \"org.jetbrains.kotlin.android\" version \"1.9.25\""
          );
          
          // apply false가 있는 경우도 처리
          pluginsContent = pluginsContent.replace(
            /id\s+['"]org\.jetbrains\.kotlin\.android['"]\s+version\s+['"]([^'"]+)['"]\s+apply\s+false/g,
            "id \"org.jetbrains.kotlin.android\" version \"1.9.25\" apply false"
          );
          
          // 버전이 없는 경우 추가
          if (!pluginsContent.includes('org.jetbrains.kotlin.android')) {
            pluginsContent += '\n    id "org.jetbrains.kotlin.android" version "1.9.25" apply false';
          }
        } else {
          // Kotlin 플러그인 추가
          pluginsContent += '\n    id "org.jetbrains.kotlin.android" version "1.9.25" apply false';
        }
        
        contents = contents.replace(
          pluginsBlockRegex,
          `plugins {\n${pluginsContent}\n}`
        );
      }
      
      // buildscript 블록 확인 및 수정 (ext 방식)
      const buildscriptRegex = /buildscript\s*\{([^}]*)\}/s;
      const buildscriptMatch = contents.match(buildscriptRegex);
      
      if (buildscriptMatch) {
        let buildscriptContent = buildscriptMatch[1];
        
        // ext 블록 확인 및 수정
        if (buildscriptContent.includes('ext {')) {
          const extRegex = /ext\s*\{([^}]*)\}/s;
          const extMatch = buildscriptContent.match(extRegex);
          
          if (extMatch) {
            let extContent = extMatch[1];
            
            if (extContent.includes('kotlinVersion')) {
              // 기존 kotlinVersion 교체
              extContent = extContent.replace(
                /kotlinVersion\s*=\s*['"][^'"]*['"]/g,
                "kotlinVersion = '1.9.25'"
              );
              buildscriptContent = buildscriptContent.replace(
                extRegex,
                `ext {\n${extContent}\n}`
              );
            } else {
              // ext 블록에 kotlinVersion 추가
              buildscriptContent = buildscriptContent.replace(
                extRegex,
                `ext {\n${extContent}\n    kotlinVersion = '1.9.25'\n}`
              );
            }
          }
        } else {
          // ext 블록이 없는 경우 추가
          buildscriptContent = `ext {\n    kotlinVersion = '1.9.25'\n}\n${buildscriptContent}`;
        }
        
        // dependencies 블록 확인 및 kotlin-gradle-plugin 버전 설정
        if (buildscriptContent.includes('dependencies {')) {
          // kotlin-gradle-plugin 버전을 ${kotlinVersion} 변수로 교체
          buildscriptContent = buildscriptContent.replace(
            /classpath\s+['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin:([^'"]+)['"]/g,
            "classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:\${kotlinVersion}\""
          );
          
          // kotlin-gradle-plugin이 없으면 추가
          if (!buildscriptContent.includes('kotlin-gradle-plugin')) {
            buildscriptContent = buildscriptContent.replace(
              /(dependencies\s*\{)/,
              "$1\n        classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:\${kotlinVersion}\""
            );
          }
        } else {
          // dependencies 블록이 없으면 추가
          buildscriptContent += '\n    dependencies {\n        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:${kotlinVersion}"\n    }';
        }
        
        // buildscript 블록 전체 교체
        contents = contents.replace(
          buildscriptRegex,
          `buildscript {\n${buildscriptContent}\n}`
        );
      }
      
      // 우회 플래그 제거
      // suppressKotlinVersionCompatibilityCheck 관련 코드 제거
      contents = contents.replace(
        /suppressKotlinVersionCompatibilityCheck\s*=\s*true/g,
        ''
      );
      
      // -Xsuppress-version-warning 관련 코드 제거
      contents = contents.replace(
        /freeCompilerArgs\s*\+=\s*\[['"]-Xsuppress-version-warning['"]\]/g,
        ''
      );
      
      // composeOptions 블록에서 suppressKotlinVersionCompatibilityCheck만 제거
      contents = contents.replace(
        /composeOptions\s*\{[^}]*suppressKotlinVersionCompatibilityCheck[^}]*\}/g,
        ''
      );
      
      // subprojects/allprojects에서 afterEvaluate 블록의 불필요한 설정 제거
      contents = contents.replace(
        /afterEvaluate\s*\{\s*project\s*->[^}]*suppressKotlinVersionCompatibilityCheck[^}]*\}/g,
        ''
      );
      
      contents = contents.replace(
        /afterEvaluate\s*\{\s*project\s*->[^}]*-Xsuppress-version-warning[^}]*\}/g,
        ''
      );
      
      // 4) react-native-google-mobile-ads가 끌어오는 play-services-ads 24.x를 23.4.0으로 강제 고정
      // 모든 Kotlin 아티팩트를 1.9.25로 강제 고정
      // allprojects 블록에 configurations.configureEach 추가
      const allprojectsRegex = /allprojects\s*\{([\s\S]*?)\n\}/g;
      const allprojectsConfigBlock = `
    // 모든 서브프로젝트의 컴파일 클래스패스에서 Kotlin 2.1.0 제거
    configurations.configureEach {
        resolutionStrategy {
            // ★ Google Ads 계열 전체 잠금 (서브 아티팩트까지)
            force 'com.google.android.gms:play-services-ads:23.4.0',
                  'com.google.android.gms:play-services-ads-lite:23.4.0',
                  'com.google.android.gms:play-services-ads-base:23.4.0'

            // ★ Kotlin 전 패밀리 1.9.25로 강제
            force 'org.jetbrains.kotlin:kotlin-bom:1.9.25',
                  'org.jetbrains.kotlin:kotlin-stdlib:1.9.25',
                  'org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.9.25',
                  'org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.9.25',
                  'org.jetbrains.kotlin:kotlin-stdlib-common:1.9.25',
                  'org.jetbrains.kotlin:kotlin-reflect:1.9.25',
                  'org.jetbrains.kotlin:kotlin-annotations-jvm:1.9.25'

            eachDependency { d ->
                if (d.requested.group == 'org.jetbrains.kotlin') {
                    d.useVersion '1.9.25'
                    d.because 'Align all Kotlin libs to 1.9.25 for RN/Compose compatibility'
                }
            }
        }
    }`;

      if (contents.match(allprojectsRegex)) {
        // allprojects 블록이 있으면 configurations.configureEach 추가
        contents = contents.replace(allprojectsRegex, (match, inner) => {
          if (inner.includes('configurations.configureEach')) {
            return match; // 이미 존재
          }
          // repositories 블록 뒤에 추가
          return `allprojects {${inner}${allprojectsConfigBlock}\n}`;
        });
      }

      // buildscript 블록에 configurations.classpath 추가
      const buildscriptConfigRegex = /buildscript\s*\{([\s\S]*?)\n\}/g;
      const buildscriptConfigBlock = `
    // 빌드스크립트 클래스패스도 동일 강제(컴파일러/그레이들 플러그인 경로)
    configurations.classpath {
        resolutionStrategy {
            force 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25',
                  'org.jetbrains.kotlin:kotlin-stdlib:1.9.25',
                  'org.jetbrains.kotlin:kotlin-stdlib-common:1.9.25'
        }
    }`;

      if (contents.match(buildscriptConfigRegex)) {
        contents = contents.replace(buildscriptConfigRegex, (match, inner) => {
          if (inner.includes('configurations.classpath')) {
            return match; // 이미 존재
          }
          // dependencies 블록 뒤에 추가
          return `buildscript {${inner}${buildscriptConfigBlock}\n}`;
        });
      }

      // subprojects/allprojects 블록에서 직접 추가한 커스텀 코드 제거
      // (서브프로젝트의 plugins 블록에서 version 제거하는 로직 등)
      contents = contents.replace(
        /afterEvaluate\s*\{\s*project\s*->[^}]*plugins[^}]*kotlin[^}]*version[^}]*\}/g,
        ''
      );
      
      config.modResults.contents = contents;
    }
    return config;
  });
  
  return config;
};

module.exports = withKotlinVersion;

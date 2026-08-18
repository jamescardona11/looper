#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LooperLiveActivity, NSObject)

RCT_EXTERN_METHOD(start:(NSString *)meetingId
                  title:(NSString *)title
                  startedAt:(nonnull NSNumber *)startedAt
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(update:(NSString *)meetingId
                  phase:(NSString *)phase
                  markedMoments:(nonnull NSNumber *)markedMoments
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(end:(NSString *)meetingId
                  phase:(NSString *)phase
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
